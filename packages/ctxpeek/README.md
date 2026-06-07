# ctxpeek

**Pronounced Context Peek.**

Local-first MCP server for fresh, version-pinned repo docs. ctxpeek lets AI coding assistants read documentation straight from public GitHub, GitLab, or Bitbucket repos at the branch, tag, commit, or monorepo subpath you ask for.

```bash
npx -y ctxpeek
```

## Quick Start

Claude Code:

```bash
claude mcp add --transport stdio --scope user ctxpeek -- npx -y ctxpeek
claude mcp list
```

Generic stdio MCP config:

```jsonc
{
  "mcpServers": {
    "ctxpeek": {
      "command": "npx",
      "args": ["-y", "ctxpeek"]
    }
  }
}
```

Then ask your assistant for docs by repo:

```text
Show me the routing docs from vercel/next.js@v15.0.0
```

ctxpeek also resolves fuzzy package names, so the model can turn `"drizzle orm"` into `drizzle-team/drizzle-orm` before listing the docs tree.

## Why ctxpeek

- Local stdio MCP process; no ctxpeek account or SaaS query log.
- Ref-native input: `owner/repo@ref#subpath`.
- Works with public GitHub, GitLab, and Bitbucket repos.
- Reads the requested git snapshot directly, without waiting for docs ingestion.
- Uses an on-disk cache and CDN/ETag fallbacks to reduce repeat network cost.
- Returns markdown, not large JSON envelopes.
- No third-party instruction channel between the upstream repo and your agent.

## Context7 vs ctxpeek

The core difference is the AI agent flow.

```text
Context7:
  resolve a library ID
  ask the hosted corpus for docs about a topic
  receive selected context
  answer from that curated bundle

ctxpeek:
  resolve or accept owner/repo@ref
  list the docs tree at that git snapshot
  choose the exact path to inspect
  fetch, peek, compare refs, and repeat as needed
```

Context7 is strongest when you want curated topic snippets from a hosted corpus. ctxpeek is strongest when the question depends on the exact branch, tag, commit, or monorepo package the docs came from.

## Tool Flow

The natural agent loop is:

```text
resolve_repo -> list_docs -> fetch_doc
```

Additional tools support cheap file previews (`peek`), diffs between refs (`get_changes`), changelog slices, related repos, cache status, rate limits, and issue/PR lookup.

## Docs

- Main README: <https://github.com/ruwadgroup/ctxpeek#readme>
- Getting started: <https://github.com/ruwadgroup/ctxpeek/blob/main/docs/guides/getting-started.md>
- Tool reference: <https://github.com/ruwadgroup/ctxpeek/blob/main/docs/reference/tools.md>
- Configuration: <https://github.com/ruwadgroup/ctxpeek/blob/main/docs/reference/configuration.md>
- Comparison: <https://github.com/ruwadgroup/ctxpeek/blob/main/docs/comparison.md>

## Development

```bash
pnpm install
pnpm --filter ctxpeek dev
pnpm --filter ctxpeek test
pnpm --filter ctxpeek test:integration
```
