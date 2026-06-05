# Tools reference

Every ctxpeek tool returns markdown `text` content unless noted. Tools whose output is plausibly chained programmatically (`resolve_repo`) also expose `structuredContent`; markdown remains the source of truth across MCP clients.

Tool failures are returned as markdown so the assistant can recover even in MCP clients that hide `isError` payloads. Error responses start with `# <tool> could not complete` and include `structuredContent: { ok: false, tool, error }` with fields such as `code`, `message`, `reset_at`, and `suggestions`.

Input schemas use `zod` via `@modelcontextprotocol/sdk`. Tool descriptions are written so that an agentic client defaults to ctxpeek when you mention a library — no "use ctxpeek" magic incantation required.

---

## `resolve_repo(query, opts?)`

Turn a fuzzy library name into a canonical `owner/repo`. **Project-aware**: configured `[[package]]` mappings are checked first, then cwd manifests (`package.json` / `pyproject.toml` / etc.) by name or scope. So `"autotranslate"` from a project depending on `@autotranslate/*` lands on the right repo, not a same-named toy package elsewhere. Suggests an install command when the dep is missing from your lockfile.

**Input**

```ts
{
  query: string                // Required. "next.js", "drizzle orm", "axum", …
  ecosystem?: Ecosystem        // Bias the registry probe order (also disables manifest preflight)
  force_refresh?: boolean      // Bypass the 30-day resolutions cache
}

type Ecosystem = "npm" | "pypi" | "crates" | "go" | "rubygems" | "packagist" | "hex"
```

**Output**

```markdown
# Resolved "next" → vercel/next.js  (GitHub search match)

repo:    vercel/next.js
stars:   139.5k
default: canary
latest:  v16.2.6
about:   The React Framework

Use: `list_docs("vercel/next.js@v16.2.6")`, then `fetch_doc("vercel/next.js@v16.2.6", "<path>")`

Alternative matches (lower confidence):
- ChatGPTNextWeb/NextChat — Light and fast AI assistant…
- nextauthjs/next-auth — Authentication for the Web.
```

`latest` is the most recent release tag (from `/releases/latest`), populated for both registry and GitHub-search hits. Use it directly when the user asks about a stable version — avoids a double-fetch through the default branch first.

**Structured output** also includes `latest_tag`, `confidence`, and `alternatives[]`. A 5k+-star GitHub-search match resolves at confidence 0.9 even when a similarly-named runner-up has comparable stars; ambiguity is only flagged when the winner is neither dominant nor popular. See [`docs/internals/architecture.md`](../internals/architecture.md#resolver).

---

## `list_docs(repo, opts?)`

Markdown tree of docs files in a repo.

**Input**

```ts
{
  repo: string                 // [forge:]owner/repo[@ref][#subpath]
  deep?: boolean               // Include nested docs more than 4 levels deep
  include_examples?: boolean   // Sibling section for /examples and /cookbook
  max_files?: number           // Cap on returned entries
  since?: string               // ISO date — filter to files committed since (training-cutoff diff)
}
```

**Output**

```markdown
# vercel/next.js@v15.0.0 — docs

> 187 files, ~412k tokens total. Pin: v15.0.0 → a3b1f7c.

docs/
├── 01-app/
│   ├── 01-getting-started.mdx        2.1k  ✦
│   ├── 02-routing.mdx                8.7k  ✦
│   └── …
└── …

Symbols: ✦ high-signal, ⚠️ recent.
```

---

## `fetch_doc(repo, path, opts?)`

Fetch one file at a pinned commit with YAML frontmatter metadata followed by the file body.

**Input**

```ts
{
  repo: string                 // [forge:]owner/repo[@ref][#subpath]
  path: string                 // Path relative to repo root
  lines?: [number, number]     // 0-indexed range
  head_bytes?: number          // First N bytes only
}
```

**Output**

```markdown
---
repo: vercel/next.js
ref: v15.0.0
commit: a3b1f7c
path: docs/01-app/02-routing.mdx
size: 8923
---

# Routing

App Router uses file-system based routing…
```

Files >200 KB without `lines` / `head_bytes` get a 4 KB preview plus an approximate token count and instructions for the partial-read flags.

---

## `peek(repo, path, opts?)`

A cheap look at one file. Two modes:

- **Head** (default) — the first `n` lines.
- **Grep** — pass `query` to find every match inside the file and return each with `context` lines
  around it. The search is a deterministic literal (or `regex: true`) match scoped to this one named
  file — navigation, not a vector store. See
  [Why no semantic search](../internals/architecture.md#why-no-semantic-search-or-vector-store-a-deliberate-choice).

```ts
{
  repo: string
  path: string
  n?: number               // head mode: leading lines. default 40, max 2000
  query?: string           // grep mode: substring (or regex). switches to grep
  regex?: boolean          // treat query as a JS regex. default false
  ignore_case?: boolean    // default true
  context?: number         // lines around each match. default 3, max 50
  max_matches?: number     // cap; a note is emitted when exceeded. default 20, max 200
  max_line_length?: number // truncate long lines (both modes). default 500, max 10000
}
```

**Edge cases.** Binary files (NUL byte in the first 8 KB) and empty files are reported, never dumped.
Over-long lines are truncated with a ` …(+N chars)` marker so a minified line can't blow the context
window. A query with no matches returns a friendly note (not an error); an invalid regex reports the
syntax error. The frontmatter `~tokens` reflects the _returned_ payload, not the whole file.

**Grep output**

```markdown
# Grep: vercel/next.js@v15.0.0:docs/01-routing.mdx — "generateStaticParams" (2 matches in 412 lines / 9183 bytes total)

---
repo: vercel/next.js
ref: v15.0.0
commit: a3b1f7c
path: docs/01-routing.mdx
size: 9183
~tokens: 86
---

 86  export const dynamicParams = true
 87
 88› export async function generateStaticParams() {
 89    return posts.map((p) => ({ slug: p.slug }))
──
141  // build-time only
142› generateStaticParams runs during `next build`
```

---

## `get_changes(repo, path, from_ref, to_ref)`

Unified diff for one file across two refs.

```diff
# Diff: vercel/next.js docs/middleware.mdx  v14.2.0…v15.0.0

--- a/docs/middleware.mdx
+++ b/docs/middleware.mdx
@@ -42,7 +42,7 @@
-import { NextResponse } from 'next/server'
+import { NextResponse } from 'next/server'
+import type { NextRequest } from 'next/server'
```

---

## `changelog(repo, opts?)`

Slice `CHANGELOG.md` (or `HISTORY.md` / `CHANGES.md`) between two refs.

**Input**

```ts
{
  repo: string                 // owner/repo
  from_ref?: string            // Older version heading to slice from
  to_ref?: string              // Newer version heading to slice to
}
```

Heuristic match on `## v1.2.3` / `## [1.2.3]` / `## 1.2.3` headings. Falls back to the full file when nothing matches.

---

## `related_repos(repo, limit?)`

Scrape README + llms.txt for github.com peer links, ranked by mention count. Useful for "often-used-with" suggestions.

**Output**

```markdown
# Related repos for vercel/next.js@v15.0.0

- vercel/turbo  · 9 mentions
- vercel/swr  · 4 mentions
- shadcn-ui/ui  · 2 mentions
```

---

## `get_issues(repo, opts)`

Two modes:

- **Search** — pass `query` (plus optional filters) to list matching issues / PRs.
- **Read one** — pass `number` to fetch that issue/PR's full body plus its first `comments` comments.

Opt-in per call; search uses GitHub's separate `/search/issues` bucket (prefers the GraphQL
5000pt/hr budget when a token is present, REST 30/min otherwise). Provide **either** `query` or
`number`.

**Input**

```ts
{
  repo: string
  query?: string                       // search text. required unless `number` is set
  number?: number                      // read-one: this issue/PR in full
  state?: "open" | "closed" | "all"    // default "open"
  type?: "issue" | "pr" | "both"       // default "both"
  labels?: string[]                    // AND; values with spaces are quoted
  author?: string
  assignee?: string
  since?: string                       // ISO date → updated:>=since
  sort?: "updated" | "created" | "comments"  // default "updated"
  order?: "asc" | "desc"               // default "desc"
  limit?: number                       // search results. default 5, max 20
  comments?: number                    // read-one comments. default 5, max 20
}
```

**Read-one output**

```markdown
# #1234 PR · open · Fix hydration mismatch
_@leerob · opened 3d ago · updated 1d ago · 7 comments_
https://github.com/vercel/next.js/pull/1234

<full body, truncated to a budget if very long>

## Comments (first 5 of 7)

**@someone** · 2d ago
<comment body>
```

Comments are returned in GitHub's order (oldest first); open the URL for the full thread.

---

## `cache_status(repo?)`

Diagnostic.

```markdown
# ctxpeek cache

Location:     /Users/you/Library/Caches/ctxpeek
Blobs:        128.4M
Refs/trees:   1.1M
Cap:          1024.0M (gc_days=14)
```

Pass `{ repo: "owner/repo" }` for a per-repo ref breakdown.

---

## `rate_limits(opts?)`

Show GitHub's `/rate_limit` view. If GitHub is unreachable, ctxpeek falls back to local primary-rate state and briefly delays follow-up GitHub checks. Pass `details: true` to include local throttler internals.

**Input**

```ts
{
  details?: boolean             // default false; include local throttler internals
}
```

**Output**

```markdown
# Rate limits

## GitHub API

core: 4212/5000 remaining, used 788, reset 2026-05-15T07:00:00.000Z
search: 30/30 remaining, used 0, reset 2026-05-15T06:06:00.000Z
graphql: 4995/5000 remaining, used 5, reset 2026-05-15T07:00:00.000Z
```

With `{ details: true }`:

```markdown
## Local throttler

Mode:                normal
Requests:            0 running, 0 queued
Secondary budget:    60/min (59.8/60 tokens available)
Concurrency:         8 max
```

When GitHub cannot be reached, the default output reports the failure plus the last primary headers ctxpeek observed.
