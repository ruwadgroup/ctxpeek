# Extending docpilot

docpilot ships three plug-in registries. Adding a new git forge, a new language's lockfile, or a new package-manager registry is **one file**.

The pattern is the same everywhere: a `define*(config)` factory self-registers with a global registry on module load. Add one line to the sibling `index.ts` barrel and the rest of docpilot picks it up automatically.

---

## Add a new git forge

Drop a file into [`packages/docpilot/src/fetch/forges/`](../../packages/docpilot/src/fetch/forges/):

```ts
// packages/docpilot/src/fetch/forges/codeberg.ts
import { defineForge } from "../defineForge.js";
import type { ForgeClient } from "../forgeClient.js";

export default defineForge({
  id: "codeberg",
  displayName: "Codeberg",
  aliases: ["cb"],
  tokenEnv: "CODEBERG_TOKEN",
  create: (ctx): ForgeClient => ({
    forge: "codeberg",
    hasToken: () => Boolean(ctx.token),
    getRepo: async (owner, repo) => { /* … */ },
    resolveRef: async (owner, repo, ref) => { /* … */ },
    getTree: async (owner, repo, sha) => { /* … */ },
    getContents: async (owner, repo, filePath, ref, etag) => { /* … */ },
    getLastCommitForPath: async (owner, repo, ref, filePath) => { /* … */ },
    searchRepositories: async () => [],
    cdnUrl: () => null,
  }),
});
```

Add one line to [`packages/docpilot/src/fetch/forges/index.ts`](../../packages/docpilot/src/fetch/forges/index.ts):

```ts
import codeberg from "./codeberg.js";
export const BUILT_IN_FORGES = [github, gitlab, bitbucket, codeberg] as const;
```

That's it. Repo specs `codeberg:owner/repo` (or `cb:owner/repo`) now work end-to-end. The repo-spec parser, `doctor`, and every tool route to the new forge automatically.

See [`packages/docpilot/src/fetch/forges/gitlab.ts`](../../packages/docpilot/src/fetch/forges/gitlab.ts) for a complete reference implementation against a non-GitHub REST API.

---

## Add a new lockfile parser

Drop a file into [`packages/docpilot/src/lockfile/parsers/`](../../packages/docpilot/src/lockfile/parsers/):

```ts
// packages/docpilot/src/lockfile/parsers/swift.ts
import { defineLockfileParser } from "../defineLockfileParser.js";

export default defineLockfileParser({
  ecosystem: "swift",
  filenames: ["Package.swift"],
  install: (name) => `swift package add ${name}`,
  parse: (raw) => {
    // …return ReadonlyArray<{ name, version?, direct: true }>
    return [];
  },
});
```

Add one line to [`packages/docpilot/src/lockfile/parsers/index.ts`](../../packages/docpilot/src/lockfile/parsers/index.ts):

```ts
import swift from "./swift.js";
export const BUILT_IN_LOCKFILE_PARSERS = [/* ... */, swift] as const;
```

`detectManifests`, `installSuggestion`, and `search_all`'s `from_lockfile: true` pick up the new ecosystem automatically.

---

## Add a new package-manager registry probe

Drop a file into [`packages/docpilot/src/resolve/registries/`](../../packages/docpilot/src/resolve/registries/):

```ts
// packages/docpilot/src/resolve/registries/maven.ts
import { HttpClient } from "../../util/index.js";
import { defineRegistry } from "../defineRegistry.js";
import { extractGithub } from "../extractGithub.js";

export default defineRegistry({
  id: "maven",
  displayName: "Maven Central",
  probe: async (name, http = new HttpClient(), timeoutMs) => {
    const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
    if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
    const res = await http.json<{ response?: { docs?: Array<{ scm?: string }> } }>(
      `https://search.maven.org/solrsearch/select?q=${encodeURIComponent(name)}&rows=1`,
      init,
    );
    const scm = res.data?.response?.docs?.[0]?.scm;
    return extractGithub(scm);
  },
});
```

Add one line to [`packages/docpilot/src/resolve/registries/index.ts`](../../packages/docpilot/src/resolve/registries/index.ts) and add `"maven"` to the `Ecosystem` union in [`packages/docpilot/src/config.ts`](../../packages/docpilot/src/config.ts).

`resolve_repo` will now race the Maven probe in parallel with the others.

---

## Conventions

- One concept per file. The file is named after the plug-in (`codeberg.ts`, `swift.ts`, `maven.ts`).
- The `define*` call goes at module top-level so it fires on first import.
- The factory `create` / `parse` / `probe` returns are pure — no module-scoped mutable state.
- Network calls go through the injected `HttpClient` / `ctx.http` so every outbound request is logged and rate-limited.

If you add a plug-in, please also add a unit test under [`packages/docpilot/test/unit/`](../../packages/docpilot/test/unit/) — see `lockfile.test.ts` for the shape.
