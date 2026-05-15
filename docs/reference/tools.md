# Tools reference

Every docpilot tool returns markdown `text` content unless explicitly noted. Tools whose output is plausibly chained programmatically (`resolve_repo`) also expose `structuredContent` validated against an `outputSchema`.

All input schemas use `zod` via `@modelcontextprotocol/sdk`.

---

## `resolve_repo(query, opts?)`

Turn a fuzzy library name into a canonical `owner/repo`. **Manifest-aware**: when the cwd has a `package.json` / `pyproject.toml` / etc. that contains a dep matching the query (by name or scope), the resolver prefers that exact package — so `"autotranslate"` from a project depending on `@autotranslate/*` lands on the right repo, not a same-named toy package elsewhere. Suggests an install command when the dep is missing from your lockfile.

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

Use: `list_docs("vercel/next.js@v16.2.6")` or `search_docs("vercel/next.js@v16.2.6", "...")`

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

Legend: ✦ high-signal (top-level / llms.txt / framework nav),
        ✦✦ highlighted in repo nav,
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

## `search_docs(repo, query, opts?)`

Path-based search over a snapshot's doc files. Scores doc paths against the query (filename match, path-token overlap, doc-tier bonus, depth penalty) and returns the top hits. No content is fetched — runs in ~1s on any repo because all we need is the tree, which is cached per commit sha.

**Input**

```ts
{
  repo: string     // [forge:]owner/repo[@ref]
  query: string    // Free-text
  limit?: number   // Max hits — default 10
}
```

**Output**

```markdown
# Search: "middleware" in vercel/next.js@v15.5.4  (3 hits, 1.06s)

1. docs/01-app/03-api-reference/03-file-conventions/middleware.mdx  · score 86.0
   > docs · app · api reference · file conventions · middleware
   `fetch_doc("vercel/next.js@v15.5.4", "docs/01-app/03-api-reference/03-file-conventions/middleware.mdx")`

2. docs/02-pages/04-api-reference/02-file-conventions/middleware.mdx  · score 86.0
   …
```

The snippet under each hit is a readable breadcrumb synthesized from path segments — gives the planner enough signal to pick the right file before calling `fetch_doc`.

---

## `search_all(query, opts?)`

Fan-out path-based search across many repos in one call. Same scoring as `search_docs`, results merged and ranked by score across repos.

**Input**

```ts
{
  query: string                // Free-text
  repos?: string[]             // Explicit list of repo specs
  from_lockfile?: boolean      // Resolve every direct dep in the cwd lockfile and search them — default false
  limit_per_repo?: number      // Per-repo hit cap — default 3
  total_limit?: number         // Cross-repo hit cap — default 15
}
```

**Output**

```markdown
# search_all: "server actions"  (9 hits across 3 repos, 0.21s)

## vercel/next.js@v15.0.0

1. docs/01-app/01-getting-started/12-server-actions.mdx  · score 14.2
   > Server Actions are async functions that run on the server…
   `fetch_doc(...)`

## drizzle-team/drizzle-orm@v0.30.1
…
```

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

## `doc_quality(repo)`

Scorecard for a repo's docs.

```markdown
# Docs quality: vercel/next.js@v15.0.0

llms.txt:        present (2.4k)
llms-full.txt:   present (412k)
README:          present (README.md, 8.1k)
Framework nav:   Mintlify (mint.json)
Doc files:       187 files, 1.2M total, median 4.2k
Last docs touch: 3d ago

Score: excellent (87/100)
- llms.txt present — search_docs will boost hits inside it.
- Structured docs framework detected.
```

---

## `cache_status(repo?)`

Diagnostic.

```markdown
# docpilot cache

Location:     /Users/you/Library/Caches/docpilot
Blobs:        128.4M
Refs/trees:   1.1M
Indexes:      18.2M
Cap:          1024.0M (gc_days=14)
```

Pass `{ repo: "owner/repo" }` for a per-repo ref breakdown.
