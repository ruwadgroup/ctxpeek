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

> **Status:** v0.1 shipped. GitHub + GitLab + Bitbucket. Plug-in slots for new forges, lockfiles, and registries.

</div>

<br />

## What it does

docpilot is a local stdio MCP server. Add it to your client, then ask your assistant about any library by `owner/repo`:

```bash
npx -y docpilot
```

When you say _"show me the routing docs from `vercel/next.js@v15.0.0`"_, your model calls docpilot, docpilot fetches the actual file from the actual repo at that commit, returns it as markdown, and your model works with information it can trust.

It also resolves fuzzy names (`"drizzle orm"` → `drizzle-team/drizzle-orm` via npm/PyPI/crates/Go/RubyGems/Packagist/Hex) and can search across every dep in your lockfile in one call (`search_all`).

Built for agentic clients. The model lists a tree, picks a path, reads the file, decides if it's right, calls again. We don't do top-k chunk dumps and we don't run a vector store — agents navigate structure faster than they unpack similarity scores. More on that in [the architecture doc](docs/internals/architecture.md#why-no-semantic-search-or-vector-store-a-deliberate-choice).

What you get out of the box:

- **Local-first.** Everything — cache, search, fetch — runs on your machine. No telemetry. Your queries don't leave.
- **Any public repo on GitHub, GitLab, or Bitbucket.** Codeberg / Gitea / sourcehut are one file away — see [extending docpilot](docs/guides/extending.md).
- **Ref-native by default.** Branch, tag, commit sha, and monorepo subpath are part of the input: `owner/repo@ref#subpath`.
- **Version-pinned docs without ingestion.** `owner/repo@v15.0.0`, `owner/repo@main`, and `owner/repo@<sha>` all read the matching git snapshot directly.
- **Free, forever.** Bring your own GitHub PAT — or none. Authenticated `If-None-Match` 304s don't count against your rate limit, so a warm cache is effectively unlimited.
- **Markdown out, not JSON.** ~75% smaller for the same information. Every response self-reports `~tokens` so the model can budget.
- **No third-party instruction channel.** docpilot only serves file contents from repos you name. The [ContextCrush class of bug](https://noma.security/) (Custom Rules served verbatim from a third-party registry) is structurally absent — see [Threat model](#threat-model).

<br />

## Why not Context7

Context7 is the obvious comparison, but the core difference is not "hosted vs local" or even privacy. The core difference is the retrieval model.

Context7 starts from a library ID in a hosted documentation corpus, then returns topic-shaped context. That is useful when you want curated snippets for a popular library. docpilot starts from a git snapshot: repo, ref, and optional subpath. The agent lists the docs tree, searches paths, fetches exact files, and can move between versions because every tool understands `owner/repo@ref`.

|                              | Context7                                                                                          | docpilot                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Thinking model**           | Resolve a library ID, ask for a topic, receive curated context from the hosted corpus.            | Resolve a repo/ref, inspect the tree, fetch exact files from the matching git snapshot.                                                 |
| **Version model**            | Version-specific library IDs are possible when that version exists in the corpus.                 | Branches, tags, and commit shas are the native address space: `owner/repo@main`, `@v15.0.0`, `@<sha>`.                                  |
| **Fresh dev branches**       | A new library or version has to be submitted, crawled, indexed, or refreshed before it is useful. | Works as soon as the ref exists on the forge. Pin `@<sha>` and the model reads the exact docs you just pushed.                          |
| **Agent workflow**           | Good for "give me the relevant snippet for this topic."                                           | Good for "show me this project's docs at this version, then let the agent navigate."                                                    |
| **Monorepos**                | The library ID usually points at a selected docs surface.                                         | `#subpath` is first-class: `vercel/next.js@canary#packages/next/src/lib`.                                                               |
| **Library coverage**         | Curated registry. If it is not in the corpus, it must be added first.                             | Any public repo on GitHub, GitLab, or Bitbucket. Including your own libraries and unreleased branches.                                  |
| **Wrong-library risk**       | `resolve-library-id` can choose from registry matches using Context7's ranking and trust signals. | `resolve_repo` checks package registries first, GitHub search last, and returns alternatives when ambiguous.                            |
| **Prompt-injection surface** | A hosted documentation layer can add authoring or policy surface beyond the upstream repo.        | No third-party authoring layer. docpilot serves files from the repo/ref you named. Content-layer bugs, like a malicious README, remain. |
| **Operational model**        | Hosted service, optional account/API key for higher usage.                                        | Local stdio MCP process. Bring a forge token or use public CDN fallbacks.                                                               |
| **Privacy**                  | Queries go to the hosted service.                                                                 | Query privacy falls out of the architecture, but it is not the main pitch. The main pitch is ref-addressed source-of-truth docs.        |

Context7 optimizes for a curated documentation answer. docpilot optimizes for a reproducible documentation snapshot. If your question depends on _which branch, tag, commit, or monorepo package_ the docs came from, docpilot is the better primitive.

> Long-form: [`docs/comparison.md`](docs/comparison.md) (vs Context7, GitMCP, Ref Tools).

<br />

## The story

I built docpilot because I got tired of doing the same dance every day.

I'd been elbows-deep in two of my own libraries — [`tamimbinhakim/imprint-pdf`](https://github.com/tamimbinhakim/imprint-pdf) and [`tamimbinhakim/dyadpy`](https://github.com/tamimbinhakim/dyadpy) — refactoring APIs faster than I could ship them. The repos were the source of truth. They had to be. I was the one writing the docs.

Then I'd open a _different_ project to actually use those libraries — to dogfood them, see if the API I'd just shipped was any good. The AI in that editor was, predictably, useless about my libraries. Of course it was. Its training data was months old, and even if it weren't, my last refactor was twenty minutes ago. So it would politely hallucinate an API that hadn't existed since last Tuesday, and I'd waste a turn correcting it.

So I'd do the dance:

1. Open the library's repo in another tab.
2. Find `llms-full.txt` — and hope I'd remembered to regenerate it after the rename.
3. Paste it into the chat. Watch a third of my context window evaporate on docs the model would have ignored half of anyway.
4. Repeat tomorrow because I'd shipped another breaking change at 1 AM.

I tried Context7. It's well-built and the team clearly cares. But its unit of work is a library in a hosted docs corpus, not a git ref. My problem was ref-shaped: this branch, this tag, this commit, this monorepo package. My library changed thirty minutes ago. I needed the docs at the version I was actually using, not the nearest indexed version.

The fix turned out to be obvious in hindsight: **the canonical source for a library's docs is its git repo**. So pull straight from there. Pin to a sha for reproducibility, pin to `@main` for HEAD. ETag-revalidate so repeat reads cost zero. Cache locally. No middleman.

That's docpilot. The tool I wanted on my own machine, six months ago.

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

**Codex CLI:**

```bash
codex mcp add docpilot -- npx -y docpilot
```

**Windows:** `npx` is a `.cmd` shim and several MCP clients fail to spawn it. Wrap it:

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

### Authentication

docpilot looks for a GitHub token in this order — first one wins, none required:

1. `--token <pat>` flag
2. `$GITHUB_TOKEN` env var
3. `gh auth token` if [the GitHub CLI](https://cli.github.com/) is installed and logged in
4. Anonymous (60 req/hr REST; the CDN does the heavy lifting)

If you already run `gh auth login`, you're done. `docpilot doctor` reports which path won.

### 2. Use it from your assistant

Reference any repo as `[forge:]owner/repo[@ref][#subpath]`:

```text
"Set up Drizzle ORM with Postgres in Next.js 15 server actions"
"Show me the routing docs from vercel/next.js@v15.0.0"
"Search tailwindlabs/tailwindcss@main for 'arbitrary values'"
"Use the latest tamimbinhakim/dyadpy@main API to wire up an SSE endpoint"
```

The model picks the right tool from the docpilot surface automatically. No magic incantation.

<br />

## Repo parameter format

```text
[forge:]owner/repo[@ref][#subpath]
```

```ts
vercel/next.js                                          // main HEAD, GitHub
vercel/next.js@v15.0.0                                  // tagged release
vercel/next.js@canary                                   // branch
vercel/next.js@a3b1f7c                                  // commit sha (short or full)
tailwindlabs/tailwindcss@main#packages/tailwindcss/docs // monorepo subtree
gitlab:gitlab-org/gitlab@master                         // GitLab (alias: gl:)
bitbucket:atlassian/python-bitbucket                    // Bitbucket Cloud (alias: bb:)
```

Full grammar: [`docs/reference/repo-spec.md`](docs/reference/repo-spec.md).

<br />

## Tools

```ts
resolve_repo  // "drizzle orm" → drizzle-team/drizzle-orm. Manifest-aware: prefers a dep
              // already in your cwd lockfile. Returns the latest release tag so the
              // planner can pin on the first call.
list_docs     // Markdown tree of docs files, with size hints, freshness badges,
              // llms.txt highlights. Optional `since: "2025-04-01"` filter for
              // "what changed after the model's training cutoff?".
fetch_doc     // One file at a pinned commit, YAML frontmatter + body. Supports
              // `lines` / `head_bytes` for partial reads.
search_docs   // Path-based search — scores doc paths against the query, no content
              // fetched. ~1s on any repo; the tree is cached per commit sha.
search_all    // Fan-out path search across many repos at once. Pass `repos: [...]`
              // or `from_lockfile: true`.
peek          // First N lines of a file before committing to a full fetch.
get_changes   // Unified diff for one file across two refs.
changelog     // Slice CHANGELOG.md / HISTORY.md between two refs.
related_repos // Scrape README + llms.txt for github.com peer links — "often used with…".
get_issues    // Search a repo's issues / PRs (separate /search/issues bucket, 30/min).
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

A recipe is a shareable bundle of pre-pinned repos. Pre-warm a stack with one command:

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

Authoring guide: [`docs/guides/recipes.md`](docs/guides/recipes.md). Examples: [`examples/recipes/`](examples/recipes/).

<br />

## Privacy

docpilot makes no network call to any host other than:

- `api.github.com`, `cdn.jsdelivr.net`
- `gitlab.com`, `api.bitbucket.org` (only when you use a `gitlab:` or `bitbucket:` repo spec)
- `registry.npmjs.org`, `pypi.org`, `crates.io`, `rubygems.org`, `repo.packagist.org`, `pkg.go.dev`, `hex.pm` (only when `resolve_repo` is called)

No telemetry. No analytics. Your query strings never leave your machine except as the URL path of those documented hosts.

<br />

## Threat model

**What's structurally absent**

- _No third-party authoring channel._ The ContextCrush class can't exist here — there's no registry layer, no place for anyone other than the actual repo maintainer to author content delivered to your agent.
- _No hosted query log._ Outbound calls are the ones above, only when you make them.
- _No "trust score" you can't see._ Resolution is a transparent race across package registries, GitHub stars as the last resort. Candidates are returned to the model when ambiguous.

**What docpilot does _not_ solve**

- _Content-layer prompt injection._ If a `README.md` or `llms.txt` contains an instruction-shaped payload, `fetch_doc` returns it verbatim and your model will see it. True of any tool that retrieves third-party docs. Pin to a sha you've reviewed; prefer release tags over `@main` for production prompts; don't auto-execute model output.
- _Repository takeover._ A compromised maintainer can land a malicious commit on the branch you're pinned to. Pin a sha you trust.
- _CDN compromise._ jsDelivr is donation-funded. If it served tampered bytes, docpilot would deliver them. Run with `--no-cdn` if that's not acceptable.
- _Recipe supply chain._ A `.docpilot.recipe.toml` you install can pre-warm any repo it lists. Same posture as a `package.json` dep — read what you install.

If you find a real vulnerability, see [`SECURITY.md`](SECURITY.md).

<br />

## When not to use docpilot

- You need symbol-level navigation across a repo (where is `useState` defined?) — use [`github-mcp-server`](https://github.com/github/github-mcp-server) or [`deepwiki`](https://github.com/AsyncFuncAI/deepwiki-open).
- You want to write to the repo (open issues, create PRs, commit) — docpilot is read-only by design.
- You want curated, ranked snippets across many libraries from one hosted index — that's Context7's strength when its tradeoffs are acceptable.
- Your environment blocks outbound HTTPS. docpilot needs to reach `api.github.com` (or the CDN) at least once per repo. A warm cache works fully offline.

<br />

## Honest tradeoffs

- _Unauthenticated `raw.githubusercontent.com` was rate-limited on May 8, 2025_ ([changelog](https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/)) with no documented way to authenticate. That's why docpilot defaults to jsDelivr for raw reads, even with a PAT.
- _Authenticated 304s are free_ ([docs](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)). docpilot's `If-None-Match` flow is built around this.
- _GraphQL has no ETag._ For repeated fetches, REST + ETag is cheaper. We only escalate to GraphQL on cold fetches of ≥ 4 files at once.
- _No semantic search, no vector store — deliberate._ Pre-agentic retrieval handed the model a top-k chunk dump because it couldn't go look itself. Agentic clients can list a tree, read a path, decide, and call again — so the right primitive is the structure the corpus author already encoded (filenames, folders, llms.txt). `search_docs` scores paths; `list_docs` shows the tree; `fetch_doc` returns the file. Full argument: [architecture.md](docs/internals/architecture.md#why-no-semantic-search-or-vector-store-a-deliberate-choice).
- _MCP `outputSchema` support is uneven across clients_ as of May 2026. The TS SDK, Claude Code, and Cursor validate it; some clients pass `structuredContent` to the model verbatim. docpilot returns both where useful; markdown is the source of truth.
- _`llms.txt` is a proposal, not a standard._ docpilot boosts hits inside it when present; it's never required.

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
| [Extending](docs/guides/extending.md)             | Add a forge / lockfile parser / registry    |
| [Troubleshooting](docs/guides/troubleshooting.md) | Windows, ENOENT, rate limits                |
| [Comparison](docs/comparison.md)                  | docpilot vs Context7 vs GitMCP vs Ref Tools |
| [Architecture](docs/internals/architecture.md)    | How it works inside                         |
| [Security](SECURITY.md)                           | Reporting vulnerabilities                   |
| [Contributing](CONTRIBUTING.md)                   | Dev setup, conventions                      |

<br />

## Roadmap

| Version  | Scope                                                                                                                                                                                                                                                                                                                                                                  | Status     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **v0.1** | Core MCP tool surface for resolving repos, browsing/searching/fetching docs, comparing changes, finding related repos/issues, and inspecting cache state. REST + ETag + jsDelivr + GraphQL fetch. Path-based search. Multi-forge (GitHub, GitLab, Bitbucket). Plug-in registries for forges / lockfiles / package managers. Manifest-aware resolve. Recipes. `doctor`. | ✅ Shipped |
| **v0.2** | Sharper freshness signals (per-file last-commit ages in `list_docs`). Better monorepo subpath UX. `examples`-aware `list_docs`. Lockfile-driven `--since-cutoff` flow.                                                                                                                                                                                                 | Next       |
| **v0.3** | Private-repo support via `GITHUB_TOKEN repo` scope. GitHub App installation tokens for org-wide quota. Codeberg / Gitea / sourcehut forge plug-ins.                                                                                                                                                                                                                    | Planned    |
| **v0.4** | Cross-repo `related_repos` graph. VS Code companion extension (out-of-band, opt-in HTTP shim).                                                                                                                                                                                                                                                                         | Planned    |
| **v1.0** | Stable surface. Schema freeze. SLO docs. Security review.                                                                                                                                                                                                                                                                                                              | Q4 2026    |

What's deliberately _not_ on the roadmap: a vector store, a hosted docs corpus, a hosted resolver as authority, a curated library registry, or write operations on repos. See [non-goals in the architecture doc](docs/internals/architecture.md#why-this-shape).

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

Conventions and CI gates live in [`CONTRIBUTING.md`](CONTRIBUTING.md). The repo uses TypeScript (Node ≥ 20, strict everything), Biome for JS/TS, prettier for markdown, ruff for the few Python scripts under `scripts/`, commitlint with [Conventional Commits](https://www.conventionalcommits.org/), changesets for releases, and vitest for tests.

<br />

## Become a Sponsor!

docpilot is free and built in the open. If your team relies on it, sponsoring covers the maintenance and the next round of features.

<div align="center">

<a href="https://github.com/sponsors/tamimbinhakim"><b>❤︎ &nbsp;Sponsor docpilot on GitHub</b></a>

</div>

<br />

## License

[Apache-2.0](LICENSE). Apache over MIT for the explicit patent grant — the MCP ecosystem is still churning.

<br />

<div align="center">

<sub>Built because the docs your model is reading should come from the actual repo, at the version you actually use.</sub>

<br />
<br />

<sub>— <a href="https://github.com/tamimbinhakim">Tamim Bin Hakim</a></sub>

</div>
