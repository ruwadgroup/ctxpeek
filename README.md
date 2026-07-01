<h1 align="center">ctxpeek</h1>

<p align="center"><strong>(Pronounced Context Peek)</strong></p>

<h3 align="center">
  Up-to-date library docs for your AI coding assistant.<br />
  Straight from the source repo, at the exact version you use.
</h3>

<p align="center">
  Point it at <code>owner/repo@ref</code> and your assistant reads the real docs.<br />
  No account. No SaaS. No vector store.
</p>

<div align="center">

[![npm](https://img.shields.io/npm/v/ctxpeek.svg)](https://www.npmjs.com/package/ctxpeek)
[![npm downloads](https://img.shields.io/npm/dm/ctxpeek.svg)](https://www.npmjs.com/package/ctxpeek)
[![CI](https://github.com/ruwadgroup/ctxpeek/actions/workflows/ci.yml/badge.svg)](https://github.com/ruwadgroup/ctxpeek/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

</div>

<div align="center">

<a href="#quick-start"><b>Quick Start</b></a>
&nbsp;·&nbsp;
<a href="#tools"><b>Tools</b></a>
&nbsp;·&nbsp;
<a href="docs/reference/configuration.md"><b>Configuration</b></a>
&nbsp;·&nbsp;
<a href="#vs-context7"><b>vs Context7</b></a>

</div>

<br />

## What it does

ctxpeek is a local stdio MCP server.
Add it to your client, then ask your assistant about any public library by its repo.

When you say _"show me the routing docs from `vercel/next.js@v15.0.0`"_, your assistant fetches the actual file from the actual repo at that commit and works from docs it can trust - not from stale training data.

It also resolves fuzzy names (`"drizzle orm"` → `drizzle-team/drizzle-orm`), so you can name a library the way you'd say it out loud.

What you get:

- **Always current.** Reads the live repo at the ref you name - a tag, a branch, or a commit sha. Even a branch you pushed five minutes ago.
- **Any public repo** on GitHub, GitLab, or Bitbucket. Including your own.
- **Version-pinned.** `owner/repo@v15.0.0`, `@main`, or `@<sha>` all read the matching git snapshot.
- **Local and private.** Cache and fetch run on your machine. No telemetry, no query logging.
- **Free.** Works anonymously, or bring a GitHub token for higher limits.

<br />

## Quick Start

### 1. Add ctxpeek to your MCP client

**Claude Code**

```bash
claude mcp add --transport stdio --scope user ctxpeek -- npx -y ctxpeek
```

Run `/mcp` inside Claude Code to confirm it connected.

<details>
<summary><b>Cursor</b></summary>

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per project):

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

Add to `.vscode/mcp.json`:

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

Add to `~/.codeium/windsurf/mcp_config.json`:

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
<summary><b>Windows: npx won't spawn?</b></summary>

`npx` is a `.cmd` shim on Windows and some clients can't spawn it directly. Wrap it with `cmd /c`:

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

### 2. Use it from your assistant

Just ask. The assistant picks the right ctxpeek tool on its own - no special syntax.

```text
"Set up Drizzle ORM with Postgres in Next.js 15 server actions"
"Show me the routing docs from vercel/next.js@v15.0.0"
"Search tailwindlabs/tailwindcss@main for 'arbitrary values'"
"Use the latest tamimbinhakim/dyadpy@main API to wire up an SSE endpoint"
```

When you want to point at a specific repo, ref, or subfolder, use this format:

```text
[forge:]owner/repo[@ref][#subpath]

vercel/next.js                                          // main HEAD
vercel/next.js@v15.0.0                                  // tagged release
vercel/next.js@canary                                   // branch
vercel/next.js@a3b1f7c                                  // commit sha
tailwindlabs/tailwindcss@main#packages/tailwindcss/docs // monorepo subfolder
gitlab:gitlab-org/gitlab@master                         // GitLab (alias: gl:)
bitbucket:atlassian/python-bitbucket                    // Bitbucket (alias: bb:)
```

### Authentication (optional)

ctxpeek works with no token at all. Add a GitHub token only if you hit rate limits.
It looks for one in this order and uses the first it finds:

1. `--token <pat>` flag
2. `$GITHUB_TOKEN` env var
3. `gh auth token` (if you're logged into the [GitHub CLI](https://cli.github.com/))
4. Anonymous

Run `npx -y ctxpeek doctor` to check your setup and see which path won.

<br />

## Tools

Your assistant calls these for you. You rarely need to name them.

```ts
resolve_repo  // "drizzle orm" → drizzle-team/drizzle-orm, with the latest release tag.
list_docs     // The docs tree for a repo, with size and freshness hints.
fetch_doc     // One doc file at a pinned commit. Supports partial reads.
peek          // Quick look at a file, or grep inside it for a query.
get_changes   // What changed in a file between two refs.
changelog     // The CHANGELOG slice between two refs.
related_repos // "Often used with…" peer libraries.
get_issues    // Search issues / PRs, or read one in full.
```

Full reference: [`docs/reference/tools.md`](docs/reference/tools.md).

<br />

## vs Context7

Context7 answers from a **hosted docs corpus**: resolve a library ID, ask about a topic, get curated snippets.

ctxpeek answers from a **git snapshot**: name a repo and ref, and your assistant reads the exact files at that version.

That matters when your question depends on _which branch, tag, or commit_ the docs came from - a version that just shipped, a monorepo package, or your own unreleased library.
If you want ranked snippets across a curated index of popular libraries, Context7 is the better fit.

Long-form comparison (vs Context7, GitMCP, Ref Tools): [`docs/comparison.md`](docs/comparison.md).

<br />

## Configuration

ctxpeek runs with zero config. To customize, drop a `.ctxpeek.toml` in your project or `~/.config/ctxpeek/config.toml`:

```toml
[cache]
dir      = "~/.cache/ctxpeek"
max_size = "1GiB"
gc_days  = 14

[fetch]
prefer_cdn = true
```

Full reference: [`docs/reference/configuration.md`](docs/reference/configuration.md).

**Recipes** let you pre-warm a whole stack of pinned repos with one command - handy for onboarding a team onto a known-good set of versions.
See [`docs/guides/recipes.md`](docs/guides/recipes.md).

<br />

## Privacy

ctxpeek talks only to the hosts it needs, only when you use them:

- `api.github.com`, `cdn.jsdelivr.net`
- `gitlab.com`, `api.bitbucket.org` (only for `gitlab:` / `bitbucket:` specs)
- Package registries like npm and PyPI (only when resolving a fuzzy name)

No telemetry, no analytics. Your queries never leave your machine except as the URL path to those hosts.

Security posture and threat model: [`SECURITY.md`](SECURITY.md).

<br />

## When not to use ctxpeek

- You need symbol-level navigation (where is `useState` defined?) - use [`github-mcp-server`](https://github.com/github/github-mcp-server).
- You want to write to a repo (open issues, create PRs) - ctxpeek is read-only by design.
- You want ranked snippets across a curated hosted index - that's Context7's strength.

<br />

## Documentation

|                                                   |                                            |
| ------------------------------------------------- | ------------------------------------------ |
| [Getting started](docs/guides/getting-started.md) | Install and first session                  |
| [Tools reference](docs/reference/tools.md)        | Every tool's input / output                |
| [Configuration](docs/reference/configuration.md)  | All config keys                            |
| [Repo spec grammar](docs/reference/repo-spec.md)  | The `owner/repo[@ref][#subpath]` format    |
| [Authentication](docs/guides/authentication.md)   | Tokens, `gh auth`, anonymous mode          |
| [Recipes](docs/guides/recipes.md)                 | Stack bundles                              |
| [Caching](docs/guides/caching.md)                 | What's cached, where, for how long         |
| [Troubleshooting](docs/guides/troubleshooting.md) | Windows, ENOENT, rate limits               |
| [Comparison](docs/comparison.md)                  | ctxpeek vs Context7 vs GitMCP vs Ref Tools |
| [Architecture](docs/internals/architecture.md)    | How it works inside                        |
| [Contributing](CONTRIBUTING.md)                   | Dev setup, conventions                     |

<br />

## Contributing

ctxpeek is free and built in the open. Setup, conventions, and CI gates live in [`CONTRIBUTING.md`](CONTRIBUTING.md).

If your team relies on it, [sponsoring](https://github.com/sponsors/ruwadgroup) covers maintenance and the next round of features.

<br />

## License

[Apache-2.0](LICENSE). Apache over MIT for the explicit patent grant.

<br />

<div align="center">

<sub>Built because the docs your model reads should come from the actual repo, at the version you actually use.</sub>

<br />
<br />

<sub>by <a href="https://github.com/tamimbinhakim">Tamim Bin Hakim</a></sub>

</div>
