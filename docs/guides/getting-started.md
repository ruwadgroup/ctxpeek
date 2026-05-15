# Getting started

From "no ctxpeek installed" to "my coding assistant pulled fresh Drizzle ORM docs into the chat" in five minutes.

## Prerequisites

- Node.js **≥ 20** (`node --version`)
- An MCP-capable client: Claude Desktop, Claude Code, Cursor, Windsurf, VS Code, or Codex CLI
- Optional but recommended: a [GitHub Personal Access Token](https://github.com/settings/tokens) with `Contents: Read` scope (fine-grained PAT is enough for public repos)

## 1. Add ctxpeek to your MCP client

### Claude Desktop & Claude Code

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```jsonc
{
  "mcpServers": {
    "ctxpeek": {
      "command": "npx",
      "args": ["-y", "ctxpeek"],
      "env": {
        "GITHUB_TOKEN": "ghp_…"
      }
    }
  }
}
```

Restart the client. The ctxpeek tools should appear in the tool list within a few seconds.

### Cursor

Edit `~/.cursor/mcp.json`:

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

### VS Code

Add to `mcp.servers` in your settings:

```jsonc
{
  "mcp.servers": {
    "ctxpeek": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "ctxpeek"]
    }
  }
}
```

### Codex CLI

```bash
codex mcp add ctxpeek -- npx -y ctxpeek
```

### Windsurf

Same `mcpServers` JSON shape as Claude Desktop / Cursor.

## 2. Verify the install

```bash
npx -y ctxpeek doctor
```

Expected output (abridged):

```text
# ctxpeek doctor

Platform: darwin 24.x.x / Node 20.18.0

✓ Node.js — 20.18.0
✓ npx on PATH — /usr/local/bin/npx
✓ Cache dir writable — /Users/you/Library/Caches/ctxpeek
✓ GitHub token — from $GITHUB_TOKEN — login=you, scopes=(fine-grained PAT) — public repos only
✓ api.github.com reachable
✓ cdn.jsdelivr.net reachable

Overall: ok
```

If you see warnings or failures, see [troubleshooting](troubleshooting.md).

## 3. Try it from your assistant

Start a chat in your client and ask:

> "Show me the Drizzle ORM docs for `with-postgres-server-actions`."

Behind the scenes the model will call:

```text
resolve_repo("drizzle orm")
  → drizzle-team/drizzle-orm

list_docs("drizzle-team/drizzle-orm@v0.30.1", { include_examples: true })
  → markdown tree highlighting examples/with-next-server-actions/

fetch_doc("drizzle-team/drizzle-orm@v0.30.1",
          "examples/with-next-server-actions/lib/db.ts")
  → file content with frontmatter
```

You'll see the tool calls fire in the client UI; the model now has fresh, version-pinned docs in context.

## 4. (Optional) Pre-warm a stack

If you work in a stable stack, pre-warm the cache with `ctxpeek warm`:

```bash
# Inline list of repo specs
npx -y ctxpeek warm vercel/next.js@v15.0.0 drizzle-team/drizzle-orm@v0.30.1

# Or from a recipe file
npx -y ctxpeek warm ./.ctxpeek.recipe.toml
```

Recipe file format:

```toml
# .ctxpeek.recipe.toml
[[repo]]
spec  = "vercel/next.js@v15.0.0"
alias = "next"

[[repo]]
spec  = "drizzle-team/drizzle-orm@v0.30.1"
alias = "drizzle"
```

The next session has zero cold-start latency for those repos.

## What's next

- [Authentication](authentication.md) — bring your own token, or run anonymously
- [Configuration](../reference/configuration.md) — every knob
- [Tools reference](../reference/tools.md) — inputs, outputs, and examples
- [Extending ctxpeek](extending.md) — add a forge, lockfile parser, or registry probe (one file each)
- [Architecture](../internals/architecture.md) — how it works inside, and why no vector store
- [Troubleshooting](troubleshooting.md) — when things go sideways
