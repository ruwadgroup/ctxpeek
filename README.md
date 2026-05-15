<h1 align="center">docpilot</h1>

<h3 align="center">
  Up-to-date docs for AI coding assistants.<br />
  Straight from the source repo. Cached on your machine. Pinned to the version you actually use.
</h3>

<p align="center">
  Just <code>owner/repo@ref</code> → fresh docs in your editor.<br />
  No account. No SaaS. No vector store. No third party authoring instructions for your agent.
</p>

<div align="center">

[![CI](https://github.com/tamimbinhakim/docpilot/actions/workflows/ci.yml/badge.svg)](https://github.com/tamimbinhakim/docpilot/actions/workflows/ci.yml)
[![CodeQL](https://github.com/tamimbinhakim/docpilot/actions/workflows/codeql.yml/badge.svg)](https://github.com/tamimbinhakim/docpilot/actions/workflows/codeql.yml)
[![npm](https://img.shields.io/npm/v/docpilot.svg)](https://www.npmjs.com/package/docpilot)
[![npm downloads](https://img.shields.io/npm/dm/docpilot.svg)](https://www.npmjs.com/package/docpilot)
[![bundle size](https://img.shields.io/bundlephobia/minzip/docpilot.svg)](https://bundlephobia.com/package/docpilot)
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
<a href="#why-not-context7"><b>vs Context7</b></a>
&nbsp;·&nbsp;
<a href="#the-story"><b>The Story</b></a>

</div>

<br />

<div align="center">

> **Status:** v0.1 implementation shipped — 12 MCP tools, GitHub + GitLab + Bitbucket forges, a plug-in registry for new forges / lockfiles / registries.

</div>

<br />

## What it does

Add docpilot to your MCP client — it runs as a local stdio server:

```bash
npx -y docpilot
```

Configure it in any MCP-capable client (Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, Codex CLI). Then in chat, you say things like _"show me the routing docs from `vercel/next.js@v15.0.0`"_ — and your model calls docpilot, docpilot fetches the actual file from the actual repo at the actual version, returns it as markdown, and your model gets to work with information it can trust.

It also resolves fuzzy names — `"drizzle orm"` → `drizzle-team/drizzle-orm` via npm/PyPI/crates/Go/RubyGems/Packagist/Hex — and can search across your whole project's deps in one call (`search_all`).

What you get out of the box:

- **Local-first.** Cache, index, and fetch all run on your machine. No telemetry, no analytics. Your query strings never leave.
- **Any public repo on GitHub, GitLab, or Bitbucket.** The forge layer is a plug-in registry, so Codeberg / Gitea / sourcehut are one file away.
- **Version-pinned by default.** `owner/repo@v15.0.0` is the path of least resistance, not a power-user feature you'll forget about.
- **Free, forever.** Bring your own GitHub PAT — or none. ETag 304s don't count against your rate limit, so a warm cache is effectively unlimited.
- **Markdown out, not JSON.** ~75% smaller for the same information. Every response self-reports `~tokens` so the model can budget.
- **No third-party instruction channel.** The [ContextCrush class of bug](https://noma.security/) (Custom Rules served verbatim from a third-party registry, Feb 2026) is structurally absent. docpilot serves file contents only — see [Threat model](#threat-model) for what that does and doesn't buy you.

<br />

## Why not Context7

Context7 is the elephant in the room and the reason I felt the need to write this section at all. It's the default people reach for, it's well-marketed, and it solved a real problem — for a while. But the parts that broke for me aren't bugs. They're properties of the architecture. (The personal version of how I hit each of these is in [The story](#the-story) below.)

|                                        | Context7                                                                                                                                                                                                                                                      | docpilot                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prompt-injection surface**           | Custom Rules served verbatim from the registry into the agent's trusted channel — see the [ContextCrush disclosure (Noma Security, Feb 2026)](https://noma.security/). The patch fixed the bug; the registry-as-instruction-channel **architecture remains**. | No third-party authoring layer — that whole class of injection is structurally absent. The content-layer class (a malicious README) still applies; see [Threat model](#threat-model). |
| **Trust boundary**                     | Upstash registry + third-party-authored Custom Rules.                                                                                                                                                                                                         | Your GitHub PAT. The public CDN. That's it.                                                                                                                                           |
| **Privacy**                            | Every query is sent to `context7.com`. Your phrasing is a third-party signal.                                                                                                                                                                                 | Your queries never leave your machine. Outbound calls go only to GitHub, jsDelivr, and the public package registries — and the registries only when you call `resolve_repo`.          |
| **Free-tier capacity**                 | Cut **83–92% in Jan 2026**. Many users hit caps within an afternoon of work.                                                                                                                                                                                  | Free, forever. Your rate limit is your own GitHub PAT (5,000/hr) — and authenticated `If-None-Match` 304s don't count, so a warm cache is effectively unlimited.                      |
| **Library coverage**                   | Curated registry. If it's not in Context7, you're out of luck.                                                                                                                                                                                                | Any public GitHub repo. If `owner/repo` exists on GitHub, docpilot can serve it — including the libraries _you_ just shipped.                                                         |
| **Wrong-library hallucination**        | `resolve-library-id` will silently route an unknown name to a "similar" library based on opaque trust scores. Multiple "library not found" and silent-mismatch reports on r/cursor and HN.                                                                    | `resolve_repo` is transparent: npm/PyPI/crates first, GitHub stars last. Returns the candidate list when ambiguous and lets you (or the model) pick.                                  |
| **Version pinning UX**                 | Possible (`/owner/lib/vX.Y.Z`) but most users don't bother.                                                                                                                                                                                                   | First-class. `owner/repo@ref` _is_ the canonical input format.                                                                                                                        |
| **Freshness**                          | Periodic re-index. Per their own guide: _"very recent releases — within days — may not be available yet."_                                                                                                                                                    | Your cache. ETag-revalidate-on-read means at most one round-trip stale. Pin `@main` for HEAD; pin `@v1.2.3` for reproducibility.                                                      |
| **Token bloat**                        | Returns large JSON-flavored payloads. r/cursor users complain it eats the context window.                                                                                                                                                                     | Markdown trees and frontmatter, ~75% smaller than equivalent JSON. Every response includes `~tokens: N` so the model can budget.                                                      |
| **"Use context7" magic trigger**       | Required for the model to reach for it; otherwise it doesn't fire.                                                                                                                                                                                            | Tool descriptions are written so the model **defaults** to docpilot when you mention a library. No incantation.                                                                       |
| **Account / API key for higher quota** | Yes. Privacy-conscious users opt out.                                                                                                                                                                                                                         | None. There is no account. There is nothing to log into.                                                                                                                              |
| **Monorepos**                          | Limited. `/vercel/next.js` returns "Next.js docs," not arbitrary `packages/*/docs/`.                                                                                                                                                                          | First-class `#subpath`: `vercel/next.js@canary#packages/next/src/lib`.                                                                                                                |
| **Your own libraries during dev**      | Has to be ingested first. New releases lag.                                                                                                                                                                                                                   | Works the second you push to GitHub. Pin `@<sha>` and your model is reading the diff you just shipped.                                                                                |

Context7's strengths — curation, hosted indexing, smart ranking — are precisely the surface area where it fails in ways docpilot **structurally cannot**. That's the whole pitch.

> Want the long-form comparison (vs Context7 vs GitMCP vs Ref Tools)? See [`docs/comparison.md`](docs/comparison.md).

<br />

## The story

I built docpilot because I got tired of doing the same dance every day.

I'd been elbows-deep in two of my own libraries — [`tamimbinhakim/imprint-pdf`](https://github.com/tamimbinhakim/imprint-pdf) and [`tamimbinhakim/dyadpy`](https://github.com/tamimbinhakim/dyadpy) — refactoring APIs faster than I could ship them. The repos were the source of truth for what the libraries did. They had to be. I was the one writing the docs.

Then I'd open a _different_ project to actually use those libraries — to dogfood them, see if the API I'd just shipped was any good. And the AI in that editor was, predictably, useless about my libraries. Of course it was. Its training data was months old, and even if it weren't, my last refactor was twenty minutes ago. So it would politely hallucinate an API that hadn't existed since last Tuesday, and I'd waste a turn correcting it.

So I'd do the dance:

1. Open the library's repo in another tab.
2. Find `llms-full.txt` — and hope I'd remembered to regenerate it after the rename.
3. Paste it into the chat. Watch a third of my context window evaporate on docs the model would have ignored half of anyway.
4. Repeat tomorrow because I'd shipped another breaking change at 1 AM.

I tried Context7. It's well-built and the team clearly cares. But its registry doesn't know about my libraries until it crawls them, and by their own admission, _"very recent releases — within days — may not be available yet."_ My library changed thirty minutes ago. I needed _now_, not within-days. And I didn't love that every query phrased the way I phrased it was sailing off to a third-party service so it could decide which "trust-scored" library to feed back to my model.

The fix turned out to be obvious in hindsight: **the canonical source for a library's docs is its git repo**. So pull straight from there. Pin to a commit sha for reproducibility, pin to `@main` for HEAD. ETag-revalidate so repeat reads cost zero against your rate limit. Cache locally. No middleman. No registry. No account.

That's docpilot. It's the tool I wanted on my own machine, six months ago.

<br />

## Quick Start

### 1. Add docpilot to your MCP client

**Claude Desktop / Claude Code** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```jsonc
{
  "mcpServers": {
    "docpilot": {
      "command": "npx",
      "args": ["-y", "docpilot"]
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json`), **Windsurf**, and **VS Code** (`mcp.servers`) take the same shape.

### Authentication

docpilot looks for a GitHub token in this order — first one wins, none required:

1. `--token <pat>` flag
2. `$GITHUB_TOKEN` env var
3. `gh auth token` if [the GitHub CLI](https://cli.github.com/) is installed and logged in
4. Anonymous (60 req/hr REST, CDN does the heavy lifting)

If you already run `gh auth login`, you're done — no env var to set. Run `docpilot doctor` to see which path was used and what scopes the token carries.

**Codex CLI:**

```bash
codex mcp add docpilot -- npx -y docpilot
```

**Windows note:** `npx` is a shim, not an `.exe`, and several MCP clients fail with `spawn npx ENOENT`. Use the explicit shell wrapper:

```jsonc
{
  "mcpServers": {
    "docpilot": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "docpilot"]
    }
  }
}
```

Run `npx -y docpilot doctor` once to verify your environment.

### 2. Use it from your assistant

Reference any GitHub repo as `owner/repo[@ref][#subpath]`:

```text
"Set up Drizzle ORM with Postgres in Next.js 15 server actions"
"Show me the routing docs from vercel/next.js@v15.0.0"
"Search tailwindlabs/tailwindcss@main for 'arbitrary values'"
"Use the latest tamimbinhakim/dyadpy@main API to wire up an SSE endpoint"
```

The model picks the right tool from the docpilot surface — `resolve_repo`, `list_docs`, `search_docs`, `fetch_doc`, `peek`, `get_changes`, `doc_quality`, `cache_status` — automatically. No magic incantation.

<br />

## Repo parameter format

A single string. Optionally compound:

```text
[forge:]owner/repo[@ref][#subpath]
```

```ts
vercel/next.js                                          // main HEAD, repo root (default forge: GitHub)
vercel/next.js@v15.0.0                                  // tagged release
vercel/next.js@canary                                   // branch
vercel/next.js@a3b1f7c                                  // commit sha (short or full)
tailwindlabs/tailwindcss@main#packages/tailwindcss/docs // monorepo docs subtree
python/cpython@3.13#Doc                                 // only the Doc/ tree
gitlab:gitlab-org/gitlab@master                         // GitLab (alias: gl:)
bitbucket:atlassian/python-bitbucket                    // Bitbucket Cloud (alias: bb:)
```

See [`docs/reference/repo-spec.md`](docs/reference/repo-spec.md) for the full grammar.

<br />

## Tools

```ts
resolve_repo  // "drizzle orm" → drizzle-team/drizzle-orm via npm/PyPI/crates first, GitHub last.
              // Manifest-aware: prefers packages already in your cwd lockfile. Returns the
              // latest release tag so the planner can pin on the first call. Suggests
              // `npm install …` when the dep is missing.
list_docs     // Markdown tree of docs files, with size hints, freshness badges, llms.txt highlights.
              // Optional `since: "2025-04-01"` filter for "what changed since the model's cutoff?".
fetch_doc     // One file at a pinned commit with YAML frontmatter (repo/ref/commit/path/size/
              // source/~tokens) + body. Supports `lines` / `head_bytes` for partial reads.
search_docs   // Path-based search — scores doc paths against the query, no content fetched.
              // ~1s on any repo; the tree is cached per commit sha.
search_all    // Fan-out path-based search across many repos at once. Pass `repos: [...]` or
              // `from_lockfile: true`.
peek          // First N lines of a file before committing to a full fetch.
get_changes   // Unified diff for one file across two refs.
changelog     // Slice CHANGELOG.md / HISTORY.md between two refs.
related_repos // Scrape README + llms.txt for github.com peer links — "often used with…".
get_issues    // Search a repo's issues and PRs for a query (separate /search/issues, 30/min).
doc_quality   // Scorecard: llms.txt, README, framework nav (Docusaurus / Mintlify / VitePress /
              // Nextra / Fern), last-touch age.
cache_status  // Diagnostic: cache hits, sizes, snapshot sha, last revalidate.
```

Full reference: [`docs/reference/tools.md`](docs/reference/tools.md).

### CLI surface

```text
docpilot                          Start the MCP stdio server (default)
docpilot doctor                   Environment self-check
docpilot warm <spec...>           Pre-pull trees + indexes for repos or a recipe
docpilot recipe install <path>    Pre-warm from a recipe file
docpilot cache status [repo]      On-disk cache report
docpilot cache gc                 Garbage-collect the cache
docpilot --version | --help
```

<br />

## Configuration

Discovery (highest precedence first):

1. CLI args to `docpilot`
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
npx -y docpilot recipe install ./.docpilot.recipe.toml
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

- `api.github.com`, `cdn.jsdelivr.net`
- `gitlab.com`, `api.bitbucket.org` (only when you use a `gitlab:` or `bitbucket:` repo spec)
- `registry.npmjs.org`, `pypi.org`, `crates.io`, `rubygems.org`, `repo.packagist.org`, `pkg.go.dev`, `hex.pm` (only when `resolve_repo` is called)

No telemetry. No analytics. Your query strings never leave your machine except as the URL path of those documented hosts.

<br />

## Threat model

Being honest about what's solved and what isn't:

**What's structurally absent**

- _No third-party authoring channel._ Context7's ContextCrush class — Custom Rules served from a registry into the agent's trusted channel ([Noma Security, Feb 2026](https://noma.security/)) — cannot exist in docpilot because there is no registry layer. There is nowhere for a "library owner" (other than the actual repo maintainer) to author content delivered to your agent.
- _No hosted query log._ Your phrasing never goes to a third party. The only outbound calls are the ones listed above, and only when you make them.
- _No "trust score" you can't see._ Resolution is a transparent race across package registries — npm/PyPI/crates/etc — with GitHub stars as the last resort. The candidates list is returned to the model when ambiguous; no opaque ranking decides on your behalf.

**What docpilot does _not_ solve**

- _Content-layer prompt injection._ If a library's `README.md`, `llms.txt`, or other docs file contains an instruction-shaped payload (`"ignore previous instructions and …"`), `fetch_doc` will return it verbatim and your model will see it. This is true of any tool that retrieves third-party docs, including Context7, GitMCP, and `curl | pbcopy`. Mitigations: pin to a commit sha you've reviewed, prefer release tags over `@main` for production prompts, and don't auto-execute model output without review.
- _Repository takeover._ If a maintainer's GitHub credentials are compromised and a malicious commit lands on the branch you've pinned to, docpilot will faithfully serve the malicious doc. Pin to a sha you trust, or use a CDN-only mode against a sha you've audited.
- _CDN compromise._ jsDelivr is a donation-funded CDN; we use it because commit-pinned URLs are permanently cached and free against your GitHub bucket. If it ever served tampered bytes, docpilot would faithfully deliver them. Multi-CDN failover (`statically.io`, `raw.githack.com`) is documented but not in v1; in the meantime, run with `--no-cdn` if you need REST-only fetches.
- _Recipe supply chain._ A `.docpilot.recipe.toml` you install can pre-warm any repo it lists. We treat recipes as user-trusted input — same posture as a `package.json` dependency. Read what you install.

If you find a real vulnerability, see [`SECURITY.md`](SECURITY.md).

<br />

## When not to use docpilot

docpilot is built for **documentation** retrieval, not source-code understanding. Reach for a different tool when:

- You need symbol-level navigation across a repo (where is `useState` defined?) — use [`github-mcp-server`](https://github.com/github/github-mcp-server) (official) or [`deepwiki`](https://github.com/AsyncFuncAI/deepwiki-open).
- You want to write to the repo (open issues, create PRs, commit) — docpilot is read-only by design. Use the official GitHub MCP server.
- You want curated, ranked snippets across many libraries from a single hosted index — that's Context7's strength when its tradeoffs are acceptable to you.
- You're running in an environment where outbound HTTPS is blocked. docpilot needs to reach `api.github.com` (or `cdn.jsdelivr.net`) at least once per repo to fetch anything new. A warm cache works fully offline.

<br />

## Honest tradeoffs

A few decisions worth calling out before you build on top:

- _Unauthenticated `raw.githubusercontent.com` was rate-limited on May 8, 2025_ ([GitHub changelog](https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/)) with no documented way to authenticate. That's _why_ docpilot defaults to the jsDelivr CDN for raw reads, even when a PAT is present.
- _Authenticated 304 responses are free_ against GitHub's primary rate limit ([docs.github.com](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)). docpilot's `If-None-Match` flow is built around this — a warm cache effectively doesn't count against your 5,000/hr.
- _GraphQL has no ETag._ For repeated fetches of the same files, REST + ETag is cheaper. docpilot only escalates to GraphQL on cold fetches of ≥ 4 files at once.
- _No semantic search, no vector store — deliberate._ Pre-agentic retrieval handed the model a top-k chunk dump because it couldn't go look itself. Agentic clients can list a tree, read a path, decide, and call again — so the right primitive is the structure the corpus author already encoded (filenames, folders, llms.txt), not a similarity score over text we don't own. `search_docs` scores paths; `list_docs` shows the tree; `fetch_doc` returns the file. Full argument in [architecture.md](docs/internals/architecture.md#why-no-semantic-search-or-vector-store-a-deliberate-choice).
- _MCP `outputSchema` support is uneven across clients._ As of May 2026 the TypeScript SDK, Claude Code, and Cursor validate it correctly; some clients pass `structuredContent` to the model verbatim (SEP-1624 is still draft). docpilot returns both `content` and `structuredContent` where useful; the markdown `content` is the source of truth.
- _`llms.txt` is a proposal, not a standard._ Jeremy Howard published it in Sept 2024 and adoption is broad (Mintlify / Fern / Docusaurus / GitBook) but it's not an RFC. docpilot boosts hits inside `llms.txt` when present; it never _requires_ it.

<br />

## Documentation

|                                                   |                                             |
| ------------------------------------------------- | ------------------------------------------- |
| [Getting started](docs/guides/getting-started.md) | Install and first session                   |
| [Configuration](docs/reference/configuration.md)  | All config keys                             |
| [Tools reference](docs/reference/tools.md)        | Every tool's input / output                 |
| [Repo spec grammar](docs/reference/repo-spec.md)  | The `owner/repo[@ref][#subpath]` format     |
| [Authentication](docs/guides/authentication.md)   | GITHUB_TOKEN, GitHub App, anonymous         |
| [Recipes](docs/guides/recipes.md)                 | Stack bundles                               |
| [Caching](docs/guides/caching.md)                 | What's cached, where, for how long          |
| [Troubleshooting](docs/guides/troubleshooting.md) | Windows, ENOENT, rate limits                |
| [Comparison](docs/comparison.md)                  | docpilot vs Context7 vs GitMCP vs Ref Tools |
| [Architecture](docs/internals/architecture.md)    | How it works inside                         |
| [Security](SECURITY.md)                           | Reporting vulnerabilities                   |
| [Contributing](CONTRIBUTING.md)                   | Dev setup, conventions                      |

<br />

## Roadmap

| Version        | Scope                                                                                                                                                                      | Target   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **v0.1** (MVP) | Core tools (`resolve_repo`, `list_docs`, `fetch_doc`, `search_docs`, `peek`), REST + CDN + ETag fetch, npm/PyPI/crates resolver, path-based search, cache, recipes, doctor | 6 weeks  |
| **v0.2**       | `get_changes`, `doc_quality`, `cache_status`, freshness badges, llms.txt detection, lockfile pre-warm, GraphQL batch, examples mode, training-cutoff diff                  | +4 weeks |
| **v0.3**       | Issue/PR awareness, private repo support, cross-repo linking, deeper monorepo subpath UX                                                                                   | +4 weeks |
| **v0.4**       | Non-GitHub forges (GitLab, Bitbucket), local embeddings (opt-in), VS Code companion extension                                                                              | +6 weeks |
| **v1.0**       | Stable surface, schema freeze, SLO docs, security review                                                                                                                   | Q4 2026  |

<br />

## Development

```bash
git clone https://github.com/tamimbinhakim/docpilot.git
cd docpilot
pnpm install
pnpm build
pnpm test
pnpm dev          # runs docpilot from source
```

Conventions and CI gates live in [`CONTRIBUTING.md`](CONTRIBUTING.md). The repo uses:

- **TypeScript** (Node ≥ 20, `strict` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`)
- **[Biome](https://biomejs.dev/)** for JS / TS lint and format (`pnpm check`)
- **prettier** for markdown only
- **ruff** for Python (`scripts/`)
- **commitlint** with [Conventional Commits](https://www.conventionalcommits.org/)
- **changesets** for versioning and releases
- **vitest** for unit and integration tests
- **husky** + **lint-staged** for pre-commit gates

<br />

## Become a Sponsor!

docpilot is free, local-first, and built in the open. If your team relies on it — or you just want me to keep shipping the v0.x → v1.0 roadmap above — sponsoring covers the maintenance and the next round of features.

<div align="center">

<a href="https://github.com/sponsors/tamimbinhakim"><b>❤︎ &nbsp;Sponsor docpilot on GitHub</b></a>

</div>

<br />

## License

[Apache-2.0](LICENSE).

I picked Apache over MIT for the explicit patent grant, given how much the MCP ecosystem is still churning.

<br />

<div align="center">

<sub>Built because the docs your model is reading should come from the actual repo, at the version you actually use.</sub>

<br />
<br />

<sub>— <a href="https://github.com/tamimbinhakim">Tamim Bin Hakim</a></sub>

</div>
