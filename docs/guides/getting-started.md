# Getting started

This guide walks you from "no docpilot installed" to "my coding assistant pulled fresh Drizzle ORM docs into the chat."

## Prerequisites

- Node.js **≥ 20** (`node --version`)
- An MCP-capable client: Claude Desktop, Claude Code, Cursor, Windsurf, VS Code, or Codex CLI
- Optional but recommended: a [GitHub Personal Access Token](https://github.com/settings/tokens) with `Contents: Read` scope (fine-grained PAT is enough for public repos)

## 1. Add docpilot to your MCP client

### Claude Desktop & Claude Code

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```jsonc
{
  "mcpServers": {
    "docpilot": {
      "command": "npx",
      "args": ["-y", "docpilot-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_…"
      }
    }
  }
}
```

Restart the client. The docpilot tools should appear in the tool list within a few seconds.

### Cursor

Edit `~/.cursor/mcp.json`:

```jsonc
{
  "mcpServers": {
    "docpilot": {
      "command": "npx",
      "args": ["-y", "docpilot-mcp"]
    }
  }
}
```

### VS Code

Add to `mcp.servers` in your settings:

```jsonc
{
  "mcp.servers": {
    "docpilot": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "docpilot-mcp"]
    }
  }
}
```

### Codex CLI

```bash
codex mcp add docpilot -- npx -y docpilot-mcp
```

### Windsurf

Same `mcpServers` JSON shape as Claude Desktop / Cursor.

## 2. Verify the install

```bash
npx -y docpilot-mcp doctor
```

Expected output (abridged):

```
docpilot doctor
  ok    node 20.18.0 on darwin-arm64
  ok    npx resolvable from spawn context
  ok    GITHUB_TOKEN set, scope: Contents:Read
  ok    cache dir writable: /Users/you/Library/Caches/docpilot
  ok    cdn.jsdelivr.net reachable
  ok    api.github.com reachable, 4983/5000 remaining
```

If you see warnings or failures, see [troubleshooting](troubleshooting.md).

## 3. Try it from your assistant

Start a chat in your client and ask:

> "Show me the Drizzle ORM docs for `with-postgres-server-actions`."

Behind the scenes the model will call:

```text
resolve_repo("drizzle orm")
  → drizzle-team/drizzle-orm

list_docs("drizzle-team/drizzle-orm@latest", { include_examples: true })
  → markdown tree highlighting examples/with-next-server-actions/

fetch_doc("drizzle-team/drizzle-orm@v0.30.1",
          "examples/with-next-server-actions/lib/db.ts")
  → file content with frontmatter
```

You'll see the tool calls fire in the client UI; the model now has fresh, version-pinned docs in context.

## 4. (Optional) Set up a recipe

If you work in a stable stack, pre-warm the cache:

```toml
# .docpilot.recipe.toml in your project root
[[repo]]
spec  = "vercel/next.js@v15.0.0"
alias = "next"

[[repo]]
spec  = "drizzle-team/drizzle-orm@v0.30.1"
alias = "drizzle"
```

```bash
npx -y docpilot-mcp recipe install ./.docpilot.recipe.toml
```

The next session has zero cold-start latency for those repos.

## What's next

- [Authentication](authentication.md) — bring your own token, or run anonymously
- [Configuration](../reference/configuration.md) — every knob
- [Tools reference](../reference/tools.md) — what each tool returns
- [Troubleshooting](troubleshooting.md) — when things go sideways
