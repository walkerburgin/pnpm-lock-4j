import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import chalk from "chalk";
import neo4j from "neo4j-driver";
import { outdent } from "outdent";
import yargs from "yargs";

import { loadPnpmLockfile } from "./PnpmLock.mjs";
import { Dependency, Package } from "./types.mjs";

const args = await yargs(process.argv.slice(2))
    .scriptName("pnpm4j")
    .usage(
        outdent`
            $0
        `,
    )
    .option("uri", {
        type: "string",
        describe: "Neo4j database URI",
        default: "bolt://localhost:7687",
    })
    .option("username", {
        type: "string",
        describe: "Neo4j database username",
        default: "neo4j",
    })
    .option("password", {
        type: "string",
        describe: "Neo4j database password",
        default: "neo4j",
    })
    .option("database", {
        type: "string",
        describe: "Neo4j database name",
        default: "neo4j",
    })
    .option("lockfile", {
        type: "string",
        demandOption: true,
        coerce: (arg) => (path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg)),
    })
    .wrap(null)
    .parse();

function resolve(from: string, name: string, version: string): string {
    if (version.startsWith("link:")) {
        return path.normalize(path.join(from, version.slice("link:".length)));
    } else if (/^\w:/.test(version)) {
        throw new Error();
    }
    return `${name}@${version}`;
}

// Load the specified `pnpm-lock.yaml` file
process.stderr.write(`Loading and processing ${chalk.bold(args.lockfile)}… `);
const pnpmLockfile = await loadPnpmLockfile(args.lockfile);

const packages: Package[] = [];
const dependencies: Dependency[] = [];
for (const [id, importer] of Object.entries(pnpmLockfile.importers)) {
    const packageJson = JSON.parse(
        await fs.readFile(path.join(path.dirname(args.lockfile), id, "package.json"), "utf8"),
    );
    packages.push({
        id,
        name: packageJson.name,
        version: packageJson.version ?? null,
        isInRepo: true,
    });

    for (const [name, dep] of [...Object.entries(importer.dependencies), ...Object.entries(importer.devDependencies)]) {
        const to = resolve(id, name, dep.version);
        dependencies.push({
            from: id,
            to: resolve(id, name, dep.version),
        });
    }
}

for (const [id, snapshot] of Object.entries(pnpmLockfile.snapshots)) {
    const match = id.match(/^(?<name>(@[\w.-]+\/)?[\w.-]+)@(?<version>[^(]+).*$/);
    if (match == null || match.groups == null) {
        throw new Error(id);
    }

    packages.push({
        id,
        name: match.groups["name"],
        version: match.groups["version"],
        isInRepo: false,
    });

    for (const [name, dep] of [...Object.entries(snapshot.dependencies)]) {
        dependencies.push({
            from: id,
            to: resolve(id, name, dep),
        });
    }
}
process.stderr.write(chalk.green("done\n"));

// Connect to the database
process.stderr.write(`Connecting to ${chalk.bold(args.uri)}… `);
const driver = neo4j.driver(args.uri, neo4j.auth.basic(args.username, args.password));
const db = driver.session({ database: args.database });
process.stderr.write(chalk.green("done\n"));

try {
    process.stderr.write(`Writing dependency information to the ${chalk.bold(args.database)} database… `);
    await db.executeWrite(async (txn) => {
        txn.run(outdent`
            MATCH (pkg:Package)
            DETACH DELETE pkg
        `);

        txn.run(
            outdent`
                UNWIND $packages AS package 
                MERGE (p:Package { id: package.id })
                SET p += package
            `,
            {
                packages,
            },
        );

        txn.run(
            outdent`
                UNWIND $dependencies AS dependency
                MATCH (a:Package { id: dependency.from }), (b:Package { id: dependency.to })
                CREATE (a)-[:DEPENDS_ON]->(b)
            `,
            {
                dependencies,
            },
        );
    });
    process.stderr.write(chalk.green("done\n"));

    process.stderr.write(`Creating indexes… `);
    await db.run(`CREATE INDEX IF NOT EXISTS FOR (pkg:Package) ON (pkg.isInRepo)`);
    await db.run(`CREATE INDEX IF NOT EXISTS FOR (pkg:Package) ON (pkg.name)`);
    process.stderr.write(chalk.green("done\n"));
} catch (err) {
    process.stderr.write(chalk.red("FAILED\n"));
    console.error(err);
} finally {
    process.stderr.write("Closing the connection to the database… ");
    await db.close();
    await driver.close();
    process.stderr.write(chalk.green("done\n"));
}
