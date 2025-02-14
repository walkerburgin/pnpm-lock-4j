# `pnpm-lock-4j`

Extract dependency information from `pnpm-lock.yaml` and ingest it into the graph database [`neo4j`](https://neo4j.com/).

## Queries

**Find all in-repo transitive dependencies of `@monorepo/foo-app`:**

```cypher
MATCH (pkg:Package { name: "@monorepo/foo-app" })-[:DEPENDS_ON*]->(dep:Package { isInRepo: TRUE })
WITH collect(DISTINCT pkg) + collect(DISTINCT dep) AS nodes
UNWIND nodes AS node
WITH DISTINCT node
MATCH path = (node)-[:DEPENDS_ON]->(directDep:Package { isInRepo: TRUE })
RETURN path
ORDER BY node.name
```

**Find the shorted path from `@monorepo/foo-app` to each of its in-repo transitive dependencies**:

```cypher
MATCH (pkg:Package { name: "@monorepo/foo-app" })-[:DEPENDS_ON*]->(dep:Package { isInRepo: TRUE })
WITH DISTINCT pkg, dep
MATCH path = shortestPath((pkg)-[:DEPENDS_ON*]->(dep))
RETURN path
ORDER BY length(path) DESC
```

