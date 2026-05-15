# Tools reference

Every ctxpeek tool returns markdown `text` content unless noted. Tools whose output is plausibly chained programmatically (`resolve_repo`) also expose `structuredContent`; markdown remains the source of truth across MCP clients.

Tool failures are returned as markdown so the assistant can recover even in MCP clients that hide `isError` payloads. Error responses start with `# <tool> could not complete` and include `structuredContent: { ok: false, tool, error }` with fields such as `code`, `message`, `reset_at`, and `suggestions`.

Input schemas use `zod` via `@modelcontextprotocol/sdk`. Tool descriptions are written so that an agentic client defaults to ctxpeek when you mention a library — no "use ctxpeek" magic incantation required.

---

## `resolve_repo(query, opts?)`

Turn a fuzzy library name into a canonical `owner/repo`. **Manifest-aware**: if the cwd has a `package.json` / `pyproject.toml` / etc. with a dep matching the query (by name or scope), the resolver prefers that exact package. So `"autotranslate"` from a project depending on `@autotranslate/*` lands on the right repo, not a same-named toy package elsewhere. Suggests an install command when the dep is missing from your lockfile.

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

Legend: ✦ high-signal (root README, llms files, index, quickstart),
        ⚠️ changed within last 7d (or since `since`).
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
source: cdn
~tokens: 2150
---

# Routing

App Router uses file-system based routing…
```

Files >200 KB without `lines` / `head_bytes` get a 4 KB preview plus instructions for the partial-read flags.

---

## `peek(repo, path, n?)`

Cheap preview — first N lines.

```ts
{
  repo: string
  path: string
  n?: number  // default 40
}
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

## `get_issues(repo, query, opts?)`

Search a repo's open issues / PRs that mention `query`. Uses GitHub's separate `/search/issues` bucket (30/min).

**Input**

```ts
{
  repo: string
  query: string
  state?: "open" | "closed" | "all"   // default "open"
  type?: "issue" | "pr" | "both"      // default "both"
  limit?: number                       // default 5
}
```

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

## `rate_limits()`

Show GitHub's `/rate_limit` view and local throttler accounting. If GitHub is unreachable, ctxpeek falls back to local state and briefly delays follow-up GitHub checks.

**Input**

```ts
{}
```

**Output**

```markdown
# Rate limits

## GitHub API

core: 4212/5000 remaining, used 788, reset 2026-05-15T07:00:00.000Z
search: 30/30 remaining, used 0, reset 2026-05-15T06:06:00.000Z
graphql: 4995/5000 remaining, used 5, reset 2026-05-15T07:00:00.000Z

## Local throttler

Mode:                normal
Requests:            0 running, 0 queued
Secondary budget:    60/min (59.8/60 tokens available)
Concurrency:         8 max
```

When GitHub cannot be reached, the GitHub section reports the failure and the local section also includes the last primary headers ctxpeek observed.
