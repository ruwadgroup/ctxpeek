# Getting started

From "no ctxpeek installed" to "my coding assistant pulled fresh Drizzle ORM docs into the chat" in five minutes.

## Prerequisites

- Node.js **≥ 20** (`node --version`)
- An MCP-capable client: Claude Code, Cursor, VS Code, Windsurf, Codex CLI, Claude Desktop, or another stdio-capable MCP client
- Optional but recommended: a [GitHub Personal Access Token](https://github.com/settings/tokens) with `Contents: Read` scope (fine-grained PAT is enough for public repos)

## 1. Add ctxpeek to your MCP client

### Claude Code

Add ctxpeek directly with the `claude` CLI:

```bash
claude mcp add --transport stdio --scope user ctxpeek -- npx -y ctxpeek
claude mcp list
```

If you want to pass a GitHub token through Claude Code, put the `--env` option before the server name:

```bash
claude mcp add --transport stdio --scope user --env GITHUB_TOKEN=github_pat_... ctxpeek -- npx -y ctxpeek
```

Inside Claude Code, run `/mcp` to confirm the server is connected.

<details>
<summary><b>Cursor</b></summary>

Edit `~/.cursor/mcp.json` for global use, or `.cursor/mcp.json` inside a project:

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

</details>

<details>
<summary><b>VS Code</b></summary>

Add this to `.vscode/mcp.json` in your workspace, or to your user MCP config:

```jsonc
{
  "servers": {
    "ctxpeek": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "ctxpeek"]
    }
  }
}
```

</details>

<details>
<summary><b>Windsurf</b></summary>

Add this to `~/.codeium/windsurf/mcp_config.json`:

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

</details>

<details>
<summary><b>Codex CLI</b></summary>

```bash
codex mcp add ctxpeek -- npx -y ctxpeek
```

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Use this only for Claude Desktop. Claude Code should use the `claude mcp add` command above.

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows:

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

</details>

<details>
<summary><b>Generic stdio MCP JSON</b></summary>

Many MCP clients accept this `mcpServers` shape:

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

</details>

<details>
<summary><b>Windows npx spawn workaround</b></summary>

If your MCP client cannot spawn `npx` on Windows, wrap it with `cmd /c`:

```jsonc
{
  "mcpServers": {
    "ctxpeek": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "ctxpeek"]
    }
  }
}
```

</details>

Restart or reload your client after changing JSON config. The ctxpeek tools should appear in the tool list within a few seconds.

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
