<div align="center">
  <a href="https://docpilot.dev" target="_blank">
    <img alt="docpilot" src="https://docpilot.dev/og.png" width="640" />
  </a>
</div>

<h1 align="center">docpilot</h1>

<h3 align="center">
  Local-first, version-pinned, registry-free docs for AI coding assistants.
</h3>

<p align="center">
  Just <code>owner/repo@ref</code> → fresh docs in your editor.<br />
  No account. No SaaS. No vector store. No third party authoring instructions for your agent.
</p>

<div align="center">

[![CI](https://github.com/docpilot/docpilot/actions/workflows/ci.yml/badge.svg)](https://github.com/docpilot/docpilot/actions/workflows/ci.yml)
[![CodeQL](https://github.com/docpilot/docpilot/actions/workflows/codeql.yml/badge.svg)](https://github.com/docpilot/docpilot/actions/workflows/codeql.yml)
[![npm](https://img.shields.io/npm/v/docpilot-mcp.svg)](https://www.npmjs.com/package/docpilot-mcp)
[![npm downloads](https://img.shields.io/npm/dm/docpilot-mcp.svg)](https://www.npmjs.com/package/docpilot-mcp)
[![bundle size](https://img.shields.io/bundlephobia/minzip/docpilot-mcp.svg)](https://bundlephobia.com/package/docpilot-mcp)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

<div align="center">

<a href="docs/guides/getting-started.md"><b>Get Started</b></a>
&nbsp;·&nbsp;
<a href="docs/reference/tools.md"><b>Tools</b></a>
&nbsp;·&nbsp;
<a href="docs/reference/configuration.md"><b>Configuration</b></a>
&nbsp;·&nbsp;
<a href="docs/guides/recipes.md"><b>Recipes</b></a>
&nbsp;·&nbsp;
<a href="#why-not-context7"><b>vs Context7</b></a>

</div>

<br />

<div align="center">

> **Status:** v0.0 — repository scaffold. Core implementation lands in v0.1 (see [Roadmap](#roadmap)).

</div>

<br />

## Quick Features

- ✅ &nbsp;**Local-first.** Cache, index, and fetch all run on your machine. No telemetry. No analytics. Your queries never leave.
- ✅ &nbsp;**Any public GitHub repo.** No registry. No curation. No "library not found".
- ✅ &nbsp;**Version-pinned by default.** `owner/repo@v15.0.0` is the path of least resistance, not a hidden option.
- ✅ &nbsp;**Free, forever.** Bring your own GitHub PAT (or none — the CDN fallback handles anonymous use).
- ✅ &nbsp;**Rate-limit optimal.** REST + ETag → jsDelivr CDN → optional GraphQL batch. ETag 304s are free.
- ✅ &nbsp;**Token-efficient.** Markdown by default, ≈75% smaller than equivalent JSON. Every response self-reports `~tokens`.
- ✅ &nbsp;**Reproducible.** Same `owner/repo@sha` always returns the same bytes.
- ✅ &nbsp;**No prompt-injection surface.** No third party can author content delivered through docpilot. Period.
- ✅ &nbsp;**One install.** `npx -y docpilot-mcp`. Drop it into any MCP client.

```bash
npx -y docpilot-mcp
```

<br />

## Why not Context7?

Context7 is the elephant in the room. It is the most popular hosted MCP for library docs, and it does some things very well. It also has structural problems that **cannot be fixed by patching individual bugs** — they're a property of the architecture.

docpilot was built from the opposite premise: **the canonical source for a library's docs is the library's own git repository.** The fewer intermediaries between that repo and the model, the fewer places things can go wrong.

Concrete differences:

|     | Context7 | docpilot |
| --- | --- | --- |
| **Prompt-injection surface** | Custom Rules served verbatim from the registry into the agent's trusted channel — see the [ContextCrush disclosure (Noma Security, Feb 2026)](https://noma.security/). The patch addressed the bug; the registry-as-instruction-channel **architecture remains**. | None. docpilot returns only file contents from `github.com/{owner}/{repo}` that you explicitly named. |
| **Trust boundary** | Upstash registry + third-party-authored Custom Rules. | Your GitHub PAT. The public CDN. That's it. |
| **Privacy** | Every query is sent to `context7.com`. Your query phrasing is a third-party signal. | Your query strings never leave your machine. Outbound calls are limited to GitHub, jsDelivr, and the public package registries — and only when you call `resolve_repo`. |
| **Free-tier capacity** | Free tier was cut **83–92% in Jan 2026**. Many users hit caps within an afternoon of work. | Free, forever. Your rate limit is your own GitHub PAT (5,000/hr) — and authenticated `If-None-Match` 304s don't count, so a warm cache is effectively unlimited. |
| **Library coverage** | Curated registry. If it's not in Context7, you're out of luck. | Any public GitHub repo. If `owner/repo` exists on GitHub, docpilot can serve it. |
| **Wrong-library hallucination** | `resolve-library-id` will silently route an unknown library to a "similar" one based on opaque trust scores. Multiple "Library not found" and silent-mismatch reports on r/cursor and HN. | `resolve_repo` is transparent: npm/PyPI/crates first, GitHub stars last. Returns the candidate list when ambiguous and lets you (or the model) pick. |
| **Version pinning UX** | Possible (`/owner/lib/vX.Y.Z`) but most users don't bother. | First-class. `owner/repo@ref` is the canonical input format. |
| **Freshness** | Periodic re-index. Per their own guide, "very recent releases — within days — may not be available yet." | Your cache. ETag-revalidate-on-read means at most one round-trip stale. Pin `@main` for HEAD; pin `@v1.2.3` for reproducibility. |
| **Token bloat** | Returns large JSON-flavored payloads. r/cursor users complain it eats the context window. | Markdown trees and frontmatter, ≈75% smaller than equivalent JSON. Every response includes `~tokens: N` so the model can budget. |
| **"Use context7" magic trigger** | Required for the model to reach for it; otherwise it doesn't fire. | Tool descriptions are written so the model **defaults** to docpilot when you mention a library. No incantation. |
| **Account / API key for higher quota** | Yes. Privacy-conscious users opt out. | None. There is no account. There is nothing to log into. |
| **Monorepos** | Limited. `/vercel/next.js` returns "Next.js docs," not arbitrary `packages/*/docs/`. | First-class `#subpath`: `vercel/next.js@canary#packages/next/src/lib`. |

Context7's strengths — curation, hosted indexing, smart ranking — are precisely the surface area where it can fail in ways docpilot **structurally cannot**. That's the whole pitch.

> Want the long-form comparison? See [`docs/comparison.md`](docs/comparison.md).

<br />

## Quick Start

### 1. Add docpilot to your MCP client

**Claude Desktop / Claude Code** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```jsonc
{
  "mcpServers": {
    "docpilot": {
      "command": "npx",
      "args": ["-y", "docpilot-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_…optional but recommended"
      }
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json`), **Windsurf**, and **VS Code** (`mcp.servers`) take the same shape.

**Codex CLI:**

```bash
codex mcp add docpilot -- npx -y docpilot-mcp
```

**Windows note:** `npx` is a shim, not an `.exe`, and several MCP clients fail with `spawn npx ENOENT`. Use the explicit shell wrapper:

```jsonc
{
  "mcpServers": {
    "docpilot": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "docpilot-mcp"]
    }
  }
}
```

Run `npx -y docpilot-mcp doctor` once to verify your environment.

### 2. Use it from your assistant

Reference any GitHub repo as `owner/repo[@ref][#subpath]`:

```text
"Set up Drizzle ORM with Postgres in Next.js 15 server actions"
"Show me the routing docs from vercel/next.js@v15.0.0"
"Search tailwindlabs/tailwindcss@main for 'arbitrary values'"
```

The model picks the right tool from the docpilot surface — `resolve_repo`, `list_docs`, `search_docs`, `fetch_doc`, `peek`, `get_changes`, `doc_quality`, `cache_status` — automatically. No magic incantation.

<br />

## Repo parameter format

A single string. Optionally compound:

```text
owner/repo[@ref][#subpath]
```

| Example | Meaning |
| --- | --- |
| `vercel/next.js` | `main` HEAD, repo root |
| `vercel/next.js@v15.0.0` | tagged release |
| `vercel/next.js@canary` | branch |
| `vercel/next.js@a3b1f7c` | commit sha |
| `tailwindlabs/tailwindcss@main#packages/tailwindcss/docs` | monorepo docs subtree |
| `python/cpython@3.13#Doc` | only the `Doc/` tree |

See [`docs/reference/repo-spec.md`](docs/reference/repo-spec.md) for the full grammar.

<br />

## Tools

| Tool | Purpose |
| --- | --- |
| `resolve_repo` | Turn `"drizzle orm"` into `drizzle-team/drizzle-orm` via npm/PyPI/crates first, GitHub last |
| `list_docs` | Markdown tree of docs files, with size hints, freshness badges, llms.txt highlights |
| `fetch_doc` | One file with frontmatter metadata; supports `lines` / `head_bytes` for partial reads |
| `search_docs` | BM25+ search across the snapshot |
| `peek` | First N lines of a file before committing to a full fetch |
| `get_changes` | Unified diff for one file across two refs |
| `doc_quality` | Scorecard: llms.txt presence, README links, framework nav, last commit age |
| `cache_status` | Diagnostic: cache hits, sizes, snapshot sha, last revalidate |

Full reference: [`docs/reference/tools.md`](docs/reference/tools.md).

<br />

## Configuration

Discovery (highest precedence first):

1. CLI args to `docpilot-mcp`
2. `.docpilot.toml` in cwd or any ancestor up to `$HOME`
3. `~/.config/docpilot/config.toml`
4. Env vars
5. Built-in defaults

A starter config:

```toml
[cache]
dir       = "~/.cache/docpilot"
max_size  = "1GiB"
gc_days   = 14

[fetch]
prefer_cdn       = true
concurrent_max   = 8
secondary_budget = 60

[auth]
github_token_env = "GITHUB_TOKEN"
```

Full reference: [`docs/reference/configuration.md`](docs/reference/configuration.md).

<br />

## Recipes

A "recipe" is a shareable bundle of pre-pinned repos. Pre-warm the cache for a stack with one command:

```bash
npx -y docpilot-mcp recipe install ./.docpilot.recipe.toml
```

```toml
# .docpilot.recipe.toml
[[repo]]
spec  = "vercel/next.js@v15.0.0"
alias = "next"

[[repo]]
spec  = "drizzle-team/drizzle-orm@v0.30.1"
alias = "drizzle"

[[repo]]
spec  = "clerk/javascript@v5#packages/clerk-js"
alias = "clerk"
```

Recipe authoring: [`docs/guides/recipes.md`](docs/guides/recipes.md). Browse community recipes: [`examples/recipes/`](examples/recipes/).

<br />

## Privacy

docpilot makes no network call to any host other than:

- `api.github.com`, `raw.githubusercontent.com`, `cdn.jsdelivr.net`
- `registry.npmjs.org`, `pypi.org`, `crates.io`, `rubygems.org`, `repo.packagist.org`, `pkg.go.dev`, `hex.pm` (only when `resolve_repo` is called)

Every outbound host is logged to a rotating `network.log` (1 MB cap) under your cache dir. No telemetry. No analytics. Your query strings never leave your machine except as the URL path of those documented hosts.

<br />

## Documentation

|  |  |
| --- | --- |
| [Getting started](docs/guides/getting-started.md) | Install and first session |
| [Configuration](docs/reference/configuration.md) | All config keys |
| [Tools reference](docs/reference/tools.md) | Every tool's input / output |
| [Repo spec grammar](docs/reference/repo-spec.md) | The `owner/repo[@ref][#subpath]` format |
| [Authentication](docs/guides/authentication.md) | GITHUB_TOKEN, GitHub App, anonymous |
| [Recipes](docs/guides/recipes.md) | Stack bundles |
| [Caching](docs/guides/caching.md) | What's cached, where, for how long |
| [Troubleshooting](docs/guides/troubleshooting.md) | Windows, ENOENT, rate limits |
| [Comparison](docs/comparison.md) | docpilot vs Context7 vs GitMCP vs Ref Tools |
| [Architecture](docs/internals/architecture.md) | How it works inside |
| [Security](SECURITY.md) | Reporting vulnerabilities |
| [Contributing](CONTRIBUTING.md) | Dev setup, conventions |

<br />

## Roadmap

| Version | Scope | Target |
| --- | --- | --- |
| **v0.1** (MVP) | Core tools (`resolve_repo`, `list_docs`, `fetch_doc`, `search_docs`, `peek`), REST + CDN + ETag fetch, npm/PyPI/crates resolver, MiniSearch index, cache, recipes, doctor | 6 weeks |
| **v0.2** | `get_changes`, `doc_quality`, `cache_status`, freshness badges, llms.txt detection, lockfile pre-warm, GraphQL batch, examples mode, training-cutoff diff | +4 weeks |
| **v0.3** | Issue/PR awareness, private repo support, cross-repo linking, deeper monorepo subpath UX | +4 weeks |
| **v0.4** | Non-GitHub forges (GitLab, Bitbucket), local embeddings (opt-in), VS Code companion extension | +6 weeks |
| **v1.0** | Stable surface, schema freeze, SLO docs, security review | Q4 2026 |

<br />

## Development

```bash
git clone https://github.com/docpilot/docpilot.git
cd docpilot
pnpm install
pnpm build
pnpm test
pnpm dev          # runs docpilot-mcp from source
```

Conventions and CI gates live in [`CONTRIBUTING.md`](CONTRIBUTING.md). The repo uses:

- **TypeScript** for runtime code (Node ≥20)
- **oxlint** + **oxfmt** for JS / TS lint and format
- **prettier** for markdown only
- **ruff** for Python (`scripts/`)
- **commitlint** with [Conventional Commits](https://www.conventionalcommits.org/)
- **changesets** for versioning and releases
- **vitest** for unit and integration tests
- **husky** + **lint-staged** for pre-commit gates

<br />

## Become a Sponsor!

docpilot is free, local-first, and built in the open. If your team relies on it, sponsoring covers the maintenance and the next round of features.

<div align="center">

<a href="https://github.com/sponsors/docpilot"><b>❤︎ &nbsp;Sponsor docpilot on GitHub</b></a>

</div>

<br />

## License

[Apache-2.0](LICENSE).

The Apache license was chosen over MIT for its explicit patent grant, given the MCP ecosystem's churn.

<br />

<div align="center">

<sub>Built because the docs your model is reading should be <i>your</i> docs, from <i>your</i> repo, at <i>your</i> version.</sub>

</div>
