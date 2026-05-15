# ctxpeek

**(Pronounced Context Peek)**

> Local-first MCP server that turns any public GitHub, GitLab, or Bitbucket repo into fresh, version-pinned documentation for AI coding assistants.

Distributed for `npx ctxpeek` use in MCP-capable clients (Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, Codex CLI).

For installation, configuration, tool reference, and troubleshooting see the top-level [README](../../README.md) and [docs/](../../docs/).

## Quick start

```jsonc
// claude_desktop_config.json (and equivalents)
{
  "mcpServers": {
    "ctxpeek": {
      "command": "npx",
      "args": ["-y", "ctxpeek"]
    }
  }
}
```

## Layout

```ts
src/
├── server.ts                          // MCP entrypoint + CLI dispatch
├── config.ts                          // .ctxpeek.toml + env discovery
├── doctor.ts                          // Environment self-check
├── recipes.ts                         // Pre-warm bundles
├── lockfile.ts                        // Manifest detection (façade)
├── tools/                             // MCP tool implementations
│   ├── resolveRepo.ts
│   ├── listDocs.ts
│   ├── fetchDoc.ts
│   ├── peek.ts
│   ├── getChanges.ts
│   ├── changelog.ts
│   ├── relatedRepos.ts
│   ├── getIssues.ts
│   ├── cacheStatus.ts
│   └── context.ts                     // Shared tool context + Snapshot resolver
├── fetch/                             // Cache → CDN → REST/ETag strategy
│   ├── strategy.ts
│   ├── githubRest.ts
│   ├── githubGraphql.ts
│   ├── jsdelivr.ts
│   ├── ratelimit.ts
│   ├── defineForge.ts
│   ├── forgeClient.ts
│   └── forges/                        // One file per forge plug-in
│       ├── github.ts
│       ├── gitlab.ts
│       └── bitbucket.ts
├── resolve/                           // Fuzzy-name → owner/repo
│   ├── orchestrator.ts
│   ├── githubSearch.ts
│   ├── extractGithub.ts
│   ├── defineRegistry.ts
│   ├── definePackageManifest.ts
│   ├── packageManifest.ts
│   ├── resolutionCache.ts
│   ├── registries/                    // One file per registry plug-in
│   │   ├── npm.ts, pypi.ts, crates.ts, go.ts
│   │   └── rubygems.ts, packagist.ts, hex.ts
│   └── packageManifests/              // One file per manifest verifier
├── lockfile/                          // Direct-dep extraction
│   ├── defineLockfileParser.ts
│   └── parsers/                       // One file per language plug-in
│       └── (same layout as above)
├── cache/                             // Content-addressed disk cache
│   └── blobs.ts, refs.ts, etag.ts, gc.ts, repoMeta.ts
├── format/                            // Markdown renderers
│   └── tree.ts, frontmatter.ts, docsPaths.ts
└── util/                              // HTTP, paths, sha, logger, promise helpers
```

## Development

```bash
pnpm install
pnpm --filter ctxpeek dev                 # tsx watch from source
pnpm --filter ctxpeek test                # unit tests
pnpm --filter ctxpeek test:integration    # MCP boot + tool/list round-trip
```

## Extending

See [`docs/guides/extending.md`](../../docs/guides/extending.md) for adding a forge, lockfile parser, or registry probe. Each is one file.
