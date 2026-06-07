<h1 align="center">ctxpeek</h1>

<p align="center"><strong>(Pronounced Context Peek)</strong></p>

<h3 align="center">
  Up-to-date docs for AI coding assistants.<br />
  Straight from the source repo. Cached on your machine. Pinned to the version you actually use.
</h3>

<p align="center">
  Just <code>owner/repo@ref</code> → fresh docs in your editor.<br />
  No account. No SaaS. No vector store. No third party authoring instructions for your agent.
</p>

<div align="center">

[![CI](https://github.com/ruwadgroup/ctxpeek/actions/workflows/ci.yml/badge.svg)](https://github.com/ruwadgroup/ctxpeek/actions/workflows/ci.yml)
[![CodeQL](https://github.com/ruwadgroup/ctxpeek/actions/workflows/codeql.yml/badge.svg)](https://github.com/ruwadgroup/ctxpeek/actions/workflows/codeql.yml)
[![npm](https://img.shields.io/npm/v/ctxpeek.svg)](https://www.npmjs.com/package/ctxpeek)
[![npm downloads](https://img.shields.io/npm/dm/ctxpeek.svg)](https://www.npmjs.com/package/ctxpeek)
[![bundle size](https://img.shields.io/bundlephobia/minzip/ctxpeek.svg)](https://bundlephobia.com/package/ctxpeek)
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

> **Status:** Current baseline complete and stable. GitHub + GitLab + Bitbucket. Plug-in slots for new forges, lockfiles, and registries. Planning is focused on what comes next.

</div>

<br />

## What it does

ctxpeek is a local stdio MCP server. Add it to your client, then ask your assistant about any library by `owner/repo`:

```bash
npx -y ctxpeek
```

When you say _"show me the routing docs from `vercel/next.js@v15.0.0`"_, your model calls ctxpeek, ctxpeek fetches the actual file from the actual repo at that commit, returns it as markdown, and your model works with information it can trust.

It also resolves fuzzy names (`"drizzle orm"` → `drizzle-team/drizzle-orm` via npm/PyPI/crates/Go/RubyGems/Packagist/Hex), so the model can get to the right repo before listing its docs tree.

Built for agentic clients. The model lists a tree, picks a path, reads the file, decides if it's right, calls again. We don't do top-k chunk dumps and we don't run a vector store — agents navigate structure faster than they unpack similarity scores. More on that in [the architecture doc](docs/internals/architecture.md#why-no-semantic-search-or-vector-store-a-deliberate-choice).

What you get out of the box:

- **Local-first.** Cache, listing, and fetch all run on your machine. No telemetry. Your queries don't leave.
- **Any public repo on GitHub, GitLab, or Bitbucket.** Codeberg / Gitea / sourcehut are one file away — see [extending ctxpeek](docs/guides/extending.md).
- **Ref-native by default.** Branch, tag, commit sha, and monorepo subpath are part of the input: `owner/repo@ref#subpath`.
- **Version-pinned docs without ingestion.** `owner/repo@v15.0.0`, `owner/repo@main`, and `owner/repo@<sha>` all read the matching git snapshot directly.
- **Free, forever.** Bring your own GitHub PAT — or none. A warm cache reads locally; authenticated conditional REST responses that return 304 do not count against your GitHub primary rate limit.
- **Markdown out, not JSON.** ~75% smaller for the same information. Docs trees and large-file guards self-report `~tokens` where it helps the model budget.
- **No third-party instruction channel.** ctxpeek only serves file contents from repos you name. The [ContextCrush class of bug](https://noma.security/) (Custom Rules served verbatim from a third-party registry) is structurally absent — see [Threat model](#threat-model).

<br />

## Why not Context7

Context7 is the obvious comparison, but the core difference is not "hosted vs local" or even privacy. The core difference is the retrieval model.

Context7 starts from a library ID in a hosted documentation corpus, then returns topic-shaped context. That is useful when you want curated snippets for a popular library. ctxpeek starts from a git snapshot: repo, ref, and optional subpath. The agent lists the docs tree, inspects paths, fetches exact files, and can move between versions because every tool understands `owner/repo@ref`.

For an AI agent, the loop looks different:

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

So Context7 is retrieval as answer assembly: the service decides which corpus entries fit the topic. ctxpeek is retrieval as navigation: the model keeps the source tree in the loop and decides the next file, ref, or subpath to inspect.

|                              | Context7                                                                                          | ctxpeek                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Thinking model**           | Resolve a library ID, ask for a topic, receive curated context from the hosted corpus.            | Resolve a repo/ref, inspect the tree, fetch exact files from the matching git snapshot.                                                |
| **Agent control**            | The agent mostly controls topic, token budget, and follow-up question.                            | The agent controls repo, ref, subpath, file path, partial reads, diffs, and follow-up navigation.                                      |
| **Version model**            | Version-specific library IDs are possible when that version exists in the corpus.                 | Branches, tags, and commit shas are the native address space: `owner/repo@main`, `@v15.0.0`, `@<sha>`.                                 |
| **Fresh dev branches**       | A new library or version has to be submitted, crawled, indexed, or refreshed before it is useful. | Works as soon as the ref exists on the forge. Pin `@<sha>` and the model reads the exact docs you just pushed.                         |
| **Agent workflow**           | Best for "give me the relevant snippet for this topic."                                           | Best for "show me this project's docs at this version, then let the agent navigate."                                                   |
| **Monorepos**                | The library ID usually points at a selected docs surface.                                         | `#subpath` is first-class: `vercel/next.js@canary#packages/next/src/lib`.                                                              |
| **Library coverage**         | Curated registry. If it is not in the corpus, it must be added first.                             | Any public repo on GitHub, GitLab, or Bitbucket. Including your own libraries and unreleased branches.                                 |
| **Wrong-library risk**       | `resolve-library-id` can choose from registry matches using Context7's ranking and trust signals. | `resolve_repo` verifies registry candidates on the forge, scores package/repo evidence, and returns alternatives when ambiguous.       |
| **Prompt-injection surface** | A hosted documentation layer can add authoring or policy surface beyond the upstream repo.        | No third-party authoring layer. ctxpeek serves files from the repo/ref you named. Content-layer bugs, like a malicious README, remain. |
| **Operational model**        | Hosted service, optional account/API key for higher usage.                                        | Local stdio MCP process. Bring a forge token or use public CDN fallbacks.                                                              |
| **Privacy**                  | Queries go to the hosted service.                                                                 | Query privacy falls out of the architecture, but it is not the main pitch. The main pitch is ref-addressed source-of-truth docs.       |

Context7 optimizes for a curated documentation answer. ctxpeek optimizes for a reproducible documentation snapshot. If your question depends on _which branch, tag, commit, or monorepo package_ the docs came from, ctxpeek is the better primitive.

> Long-form: [`docs/comparison.md`](docs/comparison.md) (vs Context7, GitMCP, Ref Tools).

<br />

## The story

I built ctxpeek because I got tired of doing the same dance every day.

I'd been elbows-deep in two of my own libraries — [`tamimbinhakim/imprint-pdf`](https://github.com/tamimbinhakim/imprint-pdf) and [`tamimbinhakim/dyadpy`](https://github.com/tamimbinhakim/dyadpy) — refactoring APIs faster than I could ship them. The repos were the source of truth. They had to be. I was the one writing the docs.

Then I'd open a _different_ project to actually use those libraries — to dogfood them, see if the API I'd just shipped was any good. The AI in that editor was, predictably, useless about my libraries. Of course it was. Its training data was months old, and even if it weren't, my last refactor was twenty minutes ago. So it would politely hallucinate an API that hadn't existed since last Tuesday, and I'd waste a turn correcting it.

So I'd do the dance:

1. Open the library's repo in another tab.
2. Find `llms-full.txt` — and hope I'd remembered to regenerate it after the rename.
3. Paste it into the chat. Watch a third of my context window evaporate on docs the model would have ignored half of anyway.
4. Repeat tomorrow because I'd shipped another breaking change at 1 AM.

I tried Context7. It's well-built and the team clearly cares. But its unit of work is a library in a hosted docs corpus, not a git ref. My problem was ref-shaped: this branch, this tag, this commit, this monorepo package. My library changed thirty minutes ago. I needed the docs at the version I was actually using, not the nearest indexed version.

The fix turned out to be obvious in hindsight: **the canonical source for a library's docs is its git repo**. So pull straight from there. Pin to a sha for reproducibility, pin to `@main` for branch docs, cache locally so repeat reads cost zero, and use ETags when REST fallback has a validator. No middleman.

That's ctxpeek. The tool I wanted on my own machine, six months ago.

<br />

## Quick Start

### 1. Add ctxpeek to your MCP client

For Claude Code, add ctxpeek directly with the `claude` CLI:

```bash
claude mcp add --transport stdio --scope user ctxpeek -- npx -y ctxpeek
claude mcp list
```

Inside Claude Code, run `/mcp` to confirm the server is connected.

<details>
<summary><b>Cursor</b></summary>

Add this to `~/.cursor/mcp.json` for global use, or `.cursor/mcp.json` inside a project:

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

`npx` is a `.cmd` shim on Windows, and several MCP clients fail to spawn it directly. Wrap it with `cmd /c`:

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

Run `npx -y ctxpeek doctor` once to verify your environment.

### Authentication

ctxpeek looks for a GitHub token in this order — first one wins, none required:

1. `--token <pat>` flag
2. `$GITHUB_TOKEN` env var
3. `gh auth token` if [the GitHub CLI](https://cli.github.com/) is installed and logged in
4. Anonymous (60 req/hr REST; the CDN does the heavy lifting)

If you already run `gh auth login`, you're done. `ctxpeek doctor` reports which path won.

### 2. Use it from your assistant

Reference any repo as `[forge:]owner/repo[@ref][#subpath]`:

```text
"Set up Drizzle ORM with Postgres in Next.js 15 server actions"
"Show me the routing docs from vercel/next.js@v15.0.0"
"Search tailwindlabs/tailwindcss@main for 'arbitrary values'"
"Use the latest tamimbinhakim/dyadpy@main API to wire up an SSE endpoint"
```

The model picks the right tool from the ctxpeek surface automatically. No magic incantation.

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
resolve_repo  // "drizzle orm" → drizzle-team/drizzle-orm. Project-aware: prefers
              // cwd/ancestor deps and npm workspace packages, including repo#subpath.
              // Returns the latest release tag so the planner can pin on the first call.
list_docs     // Markdown tree of docs files, with size hints, freshness badges,
              // llms.txt highlights. Optional `since: "2025-04-01"` filter for
              // "what changed after the model's training cutoff?".
fetch_doc     // One file at a pinned commit, YAML frontmatter + body. Supports
              // `lines` / `head_bytes` for partial reads.
peek          // Quick look at a file: first N lines, or pass `query` to grep within it
              // (literal/regex) and get every match with context. Per-line + match caps;
              // binary/empty files are reported, not dumped.
get_changes   // Unified diff for one file across two refs.
changelog     // Slice CHANGELOG.md / HISTORY.md between two refs.
related_repos // Scrape README + llms.txt for github.com peer links — "often used with…".
get_issues    // Search issues / PRs with filters (labels, author, sort, since…), or pass
              // `number` to read one in full — body + top comments. Separate rate bucket.
cache_status  // Diagnostic: cache hits, sizes, snapshot sha, last revalidate.
rate_limits   // GitHub buckets; pass `details: true` for local throttle internals.
```

Full reference: [`docs/reference/tools.md`](docs/reference/tools.md).

### CLI surface

```text
ctxpeek                          Start the MCP stdio server (default)
ctxpeek doctor                   Environment self-check
ctxpeek warm <spec...>           Pre-pull refs + doc trees for repos or a recipe
ctxpeek recipe install <path>    Pre-warm from a recipe file
ctxpeek cache status [repo]      On-disk cache report
ctxpeek cache gc                 Garbage-collect the cache
ctxpeek --version | --help
```

<br />

## Configuration

Discovery (highest precedence first):

1. CLI args to `ctxpeek`
2. `.ctxpeek.toml` in cwd or any ancestor up to `$HOME`
3. `~/.config/ctxpeek/config.toml`
4. Env vars
5. Built-in defaults

A starter config:

```toml
[cache]
dir       = "~/.cache/ctxpeek"
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
npx -y ctxpeek recipe install ./.ctxpeek.recipe.toml
```

```toml
# .ctxpeek.recipe.toml
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

ctxpeek makes no network call to any host other than:

- `api.github.com`, `cdn.jsdelivr.net`
- `gitlab.com`, `api.bitbucket.org` (only when you use a `gitlab:` or `bitbucket:` repo spec)
- `registry.npmjs.org`, `pypi.org`, `crates.io`, `rubygems.org`, `repo.packagist.org`, `pkg.go.dev`, `hex.pm` (only when `resolve_repo` is called)

No telemetry. No analytics. Your query strings never leave your machine except as the URL path of those documented hosts.

<br />

## Threat model

**What's structurally absent**

- _No third-party authoring channel._ The ContextCrush class can't exist here — there's no registry layer, no place for anyone other than the actual repo maintainer to author content delivered to your agent.
- _No hosted query log._ Outbound calls are the ones above, only when you make them.
- _No opaque hosted trust score._ Resolution uses visible registry/forge evidence: URL field, package-name match, optional package-manifest verification, repo stars, and GitHub search only as the final fallback. Candidates are returned to the model when ambiguous.

**What ctxpeek does _not_ solve**

- _Content-layer prompt injection._ If a `README.md` or `llms.txt` contains an instruction-shaped payload, `fetch_doc` returns it verbatim and your model will see it. True of any tool that retrieves third-party docs. Pin to a sha you've reviewed; prefer release tags over `@main` for production prompts; don't auto-execute model output.
- _Repository takeover._ A compromised maintainer can land a malicious commit on the branch you're pinned to. Pin a sha you trust.
- _CDN compromise._ jsDelivr is donation-funded. If it served tampered bytes, ctxpeek would deliver them. Run with `--no-cdn` if that's not acceptable.
- _Recipe supply chain._ A `.ctxpeek.recipe.toml` you install can pre-warm any repo it lists. Same posture as a `package.json` dep — read what you install.

If you find a real vulnerability, see [`SECURITY.md`](SECURITY.md).

<br />

## When not to use ctxpeek

- You need symbol-level navigation across a repo (where is `useState` defined?) — use [`github-mcp-server`](https://github.com/github/github-mcp-server) or [`deepwiki`](https://github.com/AsyncFuncAI/deepwiki-open).
- You want to write to the repo (open issues, create PRs, commit) — ctxpeek is read-only by design.
- You want curated, ranked snippets across many libraries from one hosted index — that's Context7's strength when its tradeoffs are acceptable.
- Your environment blocks outbound HTTPS. ctxpeek needs to reach `api.github.com` (or the CDN) at least once per repo. A warm cache works fully offline.

<br />

## Honest tradeoffs

- _Unauthenticated `raw.githubusercontent.com` was rate-limited on May 8, 2025_ ([changelog](https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/)) with no documented way to authenticate. That's why ctxpeek defaults to jsDelivr for raw reads, even with a PAT.
- _Authenticated 304s are free_ ([docs](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)). ctxpeek uses `If-None-Match` on REST fallbacks when it has an ETag.
- _GraphQL has no ETag._ For file content, local cache + CDN + REST/ETag is the better path. GraphQL is currently reserved for metadata batching where it reduces resolver overhead.
- _No semantic search, no vector store — deliberate._ Pre-agentic retrieval handed the model a top-k chunk dump because it couldn't go look itself. Agentic clients can list a tree, read a path, decide, and call again — so the right primitive is the structure the corpus author already encoded (filenames, folders, llms.txt). `list_docs` shows the tree; `fetch_doc` returns the file. Full argument: [architecture.md](docs/internals/architecture.md#why-no-semantic-search-or-vector-store-a-deliberate-choice).
- _MCP structured output support is uneven across clients_ as of May 2026. Some clients pass `structuredContent` to the model verbatim. ctxpeek returns structured data only where useful; markdown is the source of truth.
- _`llms.txt` is a proposal, not a standard._ ctxpeek boosts hits inside it when present; it's never required.

<br />

## Documentation

|                                                   |                                            |
| ------------------------------------------------- | ------------------------------------------ |
| [Getting started](docs/guides/getting-started.md) | Install and first session                  |
| [Configuration](docs/reference/configuration.md)  | All config keys                            |
| [Tools reference](docs/reference/tools.md)        | Every tool's input / output                |
| [Repo spec grammar](docs/reference/repo-spec.md)  | The `owner/repo[@ref][#subpath]` format    |
| [Authentication](docs/guides/authentication.md)   | Tokens, `gh auth`, anonymous mode          |
| [Recipes](docs/guides/recipes.md)                 | Stack bundles                              |
| [Caching](docs/guides/caching.md)                 | What's cached, where, for how long         |
| [Extending](docs/guides/extending.md)             | Add a forge / lockfile parser / registry   |
| [Troubleshooting](docs/guides/troubleshooting.md) | Windows, ENOENT, rate limits               |
| [Comparison](docs/comparison.md)                  | ctxpeek vs Context7 vs GitMCP vs Ref Tools |
| [Architecture](docs/internals/architecture.md)    | How it works inside                        |
| [Security](SECURITY.md)                           | Reporting vulnerabilities                  |
| [Contributing](CONTRIBUTING.md)                   | Dev setup, conventions                     |

<br />

## Roadmap

**v1.0 is released** ([on npm](https://www.npmjs.com/package/ctxpeek)). The full baseline is in place: the MCP server, resolver, doc tree/fetch tools, in-file grep (`peek`), change/changelog helpers, issue/PR search with filters plus single-item reads (`get_issues`), related-repo discovery, cache inspection, `doctor`, recipes, multi-forge support, and the extension registries. The tool schema is now under [semver](https://semver.org/) — breaking changes to a tool's input or output mean a major bump.

The next roadmap pass is planning work, not a committed release train:

| Area              | Planning direction                                                                                                                                       | Status      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Freshness UX      | Clearer branch/ref freshness messaging, richer per-file last-commit signals, and better changed-since workflows.                                         | Scoping     |
| Monorepos         | Extend `#subpath` inference beyond npm workspaces and repository-directory metadata; clearer examples/cookbook surfacing and better large-tree behavior. | In progress |
| Auth + forges     | Harden private-repo paths, document token scopes per forge, and evaluate Codeberg / Gitea / sourcehut adapters.                                          | Scoping     |
| Ecosystem breadth | More lockfile parsers and registry probes where they materially improve `resolve_repo` and manifest-aware flows.                                         | Backlog     |

What's deliberately _not_ on the roadmap: a vector store, a hosted docs corpus, a hosted resolver as authority, a curated library registry, or write operations on repos. See [non-goals in the architecture doc](docs/internals/architecture.md#why-this-shape).

<br />

## Development

```bash
git clone https://github.com/ruwadgroup/ctxpeek.git
cd ctxpeek
pnpm install
pnpm build
pnpm test
pnpm dev          # runs ctxpeek from source
```

Conventions and CI gates live in [`CONTRIBUTING.md`](CONTRIBUTING.md). The repo uses TypeScript (Node ≥ 20, strict everything), Biome for JS/TS, prettier for markdown, ruff for the few Python scripts under `scripts/`, commitlint with [Conventional Commits](https://www.conventionalcommits.org/), changesets for releases, and vitest for tests.

<br />

## Become a Sponsor!

ctxpeek is free and built in the open. If your team relies on it, sponsoring covers the maintenance and the next round of features.

<div align="center">

<a href="https://github.com/sponsors/ruwadgroup"><b>❤︎ &nbsp;Sponsor ctxpeek on GitHub</b></a>

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
