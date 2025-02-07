import fs from "node:fs/promises";

import yaml from "yaml";
import { z } from "zod";

/** Partial type definition for `pnpm-lock.yaml`. */
export const PnpmLock = z.object({
    lockfileVersion: z.string(),
    importers: z.record(
        z.string(),
        z.object({
            dependencies: z
                .record(
                    z.string(),
                    z.object({
                        specifier: z.string(),
                        version: z.string(),
                    }),
                )
                .default({}),
            devDependencies: z
                .record(
                    z.string(),
                    z.object({
                        specifier: z.string(),
                        version: z.string(),
                    }),
                )
                .default({}),
        }),
    ),
    packages: z.record(z.string(), z.unknown()),
    snapshots: z.record(
        z.string(),
        z.object({
            dependencies: z
                .record(z.string().describe("Package name"), z.string().describe("Package version"))
                .default({}),
        }),
    ),
});

export type PnpmLock = z.infer<typeof PnpmLock>;

/** Helper method to load and deserialize a `pnpm-lock.yaml` file. */
export async function loadPnpmLockfile(file: string): Promise<PnpmLock> {
    const raw = await fs.readFile(file, "utf8");
    return PnpmLock.parse(yaml.parse(raw));
}
