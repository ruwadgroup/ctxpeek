# docpilot

> Local-first MCP server that turns any public GitHub repository into fresh, version-pinned documentation for AI coding assistants.

`docpilot` is the npm package; `docpilot` is the binary. Distributed for `npx docpilot` use in MCP-capable clients (Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, Codex CLI).

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

```
src/
├── server.ts           MCP entrypoint (stdio)
├── cli.ts              `docpilot` binary (doctor, recipe, …)
├── tools/              MCP tools (resolve_repo, list_docs, fetch_doc, …)
├── fetch/              Fetch strategy: REST + ETag → CDN → GraphQL
├── resolve/            Registry-first repo resolver (npm/PyPI/crates/…)
├── cache/              Content-addressed disk cache
├── index/              MiniSearch (BM25+) lifecycle
├── format/             Markdown renderers (tree, frontmatter, search hits)
├── recipes/            .docpilot.recipe.toml loader and warmer
├── config/             .docpilot.toml + env discovery
├── doctor/             Self-check for clients (Windows ENOENT, PAT scope, …)
└── util/               Shared helpers
```

## Development

```bash
pnpm install
pnpm --filter docpilot dev          # run against a stub MCP client
pnpm --filter docpilot test         # unit tests
pnpm --filter docpilot test:integration   # hits real GitHub (requires GITHUB_TOKEN)
```
