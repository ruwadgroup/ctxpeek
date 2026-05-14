# docpilot

> Local-first MCP server that turns any public GitHub, GitLab, or Bitbucket repo into fresh, version-pinned documentation for AI coding assistants.

Distributed for `npx docpilot` use in MCP-capable clients (Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, Codex CLI).

For installation, configuration, tool reference, and troubleshooting see the top-level [README](../../README.md) and [docs/](../../docs/).

## Quick start

```jsonc
// claude_desktop_config.json (and equivalents)
{
  "mcpServers": {
    "docpilot": {
      "command": "npx",
      "args": ["-y", "docpilot"]
    }
  }
}
```

## Layout

```ts
src/
├── server.ts                          // MCP entrypoint + CLI dispatch
├── config.ts                          // .docpilot.toml + env discovery
├── doctor.ts                          // Environment self-check
├── recipes.ts                         // Pre-warm bundles
├── lockfile.ts                        // Manifest detection (façade)
├── tools/                             // 12 MCP tools, one file each
│   ├── resolveRepo.ts
│   ├── listDocs.ts
│   ├── fetchDoc.ts
│   ├── searchDocs.ts
│   ├── searchAll.ts
│   ├── peek.ts
│   ├── getChanges.ts
│   ├── changelog.ts
│   ├── relatedRepos.ts
│   ├── getIssues.ts
│   ├── docQuality.ts
│   ├── cacheStatus.ts
│   └── context.ts                     // Shared tool context + Snapshot resolver
├── fetch/                             // REST + ETag → CDN → GraphQL strategy
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
│   └── registries/                    // One file per registry plug-in
│       ├── npm.ts, pypi.ts, crates.ts, go.ts
│       └── rubygems.ts, packagist.ts, hex.ts
├── lockfile/                          // Direct-dep extraction
│   ├── defineLockfileParser.ts
│   └── parsers/                       // One file per language plug-in
│       └── (same layout as above)
├── cache/                             // Content-addressed disk cache
│   └── blobs.ts, refs.ts, etag.ts, gc.ts
├── search/                            // MiniSearch (BM25+) lifecycle
│   └── build.ts, persist.ts
├── format/                            // Markdown renderers
│   └── tree.ts, frontmatter.ts, searchMd.ts, docsPaths.ts, summarize.ts
└── util/                              // HTTP, paths, sha, logger, promise helpers
```

## Development

```bash
pnpm install
pnpm --filter docpilot dev                 # tsx watch from source
pnpm --filter docpilot test                # unit tests
pnpm --filter docpilot test:integration    # MCP boot + tool/list round-trip
```

## Extending

See [`docs/guides/extending.md`](../../docs/guides/extending.md) for adding a forge, lockfile parser, or registry probe. Each is one file.
