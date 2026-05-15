# Extending ctxpeek

ctxpeek ships four plug-in registries. Adding a new git forge, a new language's lockfile, a package manifest verifier, or a package-manager registry is **one file**.

The pattern is the same everywhere: a `define*(config)` factory self-registers with a global registry on module load. Add one line to the sibling `index.ts` barrel and the rest of ctxpeek picks it up automatically.

---

## Add a new git forge

Drop a file into [`packages/ctxpeek/src/fetch/forges/`](../../packages/ctxpeek/src/fetch/forges/):

```ts
// packages/ctxpeek/src/fetch/forges/codeberg.ts
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

Add one line to [`packages/ctxpeek/src/fetch/forges/index.ts`](../../packages/ctxpeek/src/fetch/forges/index.ts):

```ts
import codeberg from "./codeberg.js";
export const BUILT_IN_FORGES = [github, gitlab, bitbucket, codeberg] as const;
```

That's it. Repo specs `codeberg:owner/repo` (or `cb:owner/repo`) now work end-to-end. The repo-spec parser, `doctor`, and every tool route to the new forge automatically.

See [`packages/ctxpeek/src/fetch/forges/gitlab.ts`](../../packages/ctxpeek/src/fetch/forges/gitlab.ts) for a complete reference implementation against a non-GitHub REST API.

---

## Add a new lockfile parser

Drop a file into [`packages/ctxpeek/src/lockfile/parsers/`](../../packages/ctxpeek/src/lockfile/parsers/):

```ts
// packages/ctxpeek/src/lockfile/parsers/swift.ts
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

Add one line to [`packages/ctxpeek/src/lockfile/parsers/index.ts`](../../packages/ctxpeek/src/lockfile/parsers/index.ts):

```ts
import swift from "./swift.js";
export const BUILT_IN_LOCKFILE_PARSERS = [/* ... */, swift] as const;
```

`detectManifests`, `installSuggestion`, and `resolve_repo`'s manifest-aware preflight pick up the new ecosystem automatically.

---

## Add a package manifest verifier

Drop a file into [`packages/ctxpeek/src/resolve/packageManifests/`](../../packages/ctxpeek/src/resolve/packageManifests/):

```ts
// packages/ctxpeek/src/resolve/packageManifests/swift.ts
import { definePackageManifest } from "../definePackageManifest.js";

export default definePackageManifest({
  ecosystem: "swift",
  filenames: ["Package.swift"],
  candidateSubpaths: (packageName) => [`Packages/${packageName}`],
  matches: (raw, packageName) => raw.includes(`name: "${packageName}"`),
});
```

Add one line to [`packages/ctxpeek/src/resolve/packageManifests/index.ts`](../../packages/ctxpeek/src/resolve/packageManifests/index.ts):

```ts
import swift from "./swift.js";
export const BUILT_IN_PACKAGE_MANIFESTS = [/* ... */, swift] as const;
```

The resolver uses this verifier as a positive signal after a registry candidate has been verified on its forge. It is not required for resolution, but it improves confidence and monorepo package targeting.

---

## Add a new package-manager registry probe

Drop a file into [`packages/ctxpeek/src/resolve/registries/`](../../packages/ctxpeek/src/resolve/registries/):

```ts
// packages/ctxpeek/src/resolve/registries/maven.ts
import { HttpClient } from "../../util/index.js";
import { candidateFromUrl, defineRegistry } from "../defineRegistry.js";

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
    const doc = res.data?.response?.docs?.[0];
    return candidateFromUrl({
      packageName: name,
      url: doc?.scm,
      urlField: "source-code",
      confidence: 0.9,
      registryUrl: "https://search.maven.org",
    });
  },
});
```

Add one line to [`packages/ctxpeek/src/resolve/registries/index.ts`](../../packages/ctxpeek/src/resolve/registries/index.ts) and add `"maven"` to the `Ecosystem` union in [`packages/ctxpeek/src/config.ts`](../../packages/ctxpeek/src/config.ts).

`resolve_repo` will now race the Maven probe in parallel with the others.

---

## Conventions

- One concept per file. The file is named after the plug-in (`codeberg.ts`, `swift.ts`, `maven.ts`).
- The `define*` call goes at module top-level so it fires on first import.
- The factory `create` / `parse` / `probe` returns are pure — no module-scoped mutable state.
- Network calls go through the injected `HttpClient` / `ctx.http` so every outbound request is logged and rate-limited.

If you add a plug-in, please also add a unit test under [`packages/ctxpeek/test/unit/`](../../packages/ctxpeek/test/unit/) — see `lockfile.test.ts` for the shape.
