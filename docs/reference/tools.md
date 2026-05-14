# Tools reference

Every docpilot tool returns markdown `text` content unless explicitly noted. Tools whose output is plausibly chained programmatically (`resolve_repo`) also expose `structuredContent` validated against an `outputSchema`.

All input schemas use `zod` via `@modelcontextprotocol/sdk`.

---

## `resolve_repo(query, opts?)`

Turn a fuzzy library name into a canonical `owner/repo`. Suggests an install command when the dep is missing from your project lockfile.

**Input**

| Field           | Type                                                                        | Notes                                                      |
| --------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `query`         | `string`                                                                    | Required. Examples: `"next.js"`, `"drizzle orm"`, `"axum"` |
| `ecosystem`     | `"npm" \| "pypi" \| "crates" \| "go" \| "rubygems" \| "packagist" \| "hex"` | Bias the registry probe order                              |
| `force_refresh` | `boolean`                                                                   | Bypass the 30-day resolutions cache                        |

**Output**

```markdown
# Resolved "drizzle orm" → drizzle-team/drizzle-orm  (npm match)

repo:    drizzle-team/drizzle-orm
stars:   28.4k
default: main

Use: `list_docs("drizzle-team/drizzle-orm")`

> Not in your package.json — `npm install drizzle-orm` to add it.
```

When ambiguous (top result has stars < 10× #2), all candidates are returned and the model picks. Algorithm: see [`docs/internals/architecture.md`](../internals/architecture.md#resolver).

---

## `list_docs(repo, opts?)`

Markdown tree of docs files in a repo.

**Input**

| Field              | Type      | Notes                                                             |
| ------------------ | --------- | ----------------------------------------------------------------- |
| `repo`             | `string`  | `[forge:]owner/repo[@ref][#subpath]`                              |
| `deep`             | `boolean` | Include nested docs more than 4 levels deep                       |
| `include_examples` | `boolean` | Sibling section for `/examples` and `/cookbook`                   |
| `max_files`        | `number`  | Cap on returned entries                                           |
| `since`            | `string`  | ISO date — filter to files committed since (training-cutoff diff) |

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

Fetch one file with metadata frontmatter and a one-paragraph local extractive summary.

**Input**

| Field        | Type               | Notes                                |
| ------------ | ------------------ | ------------------------------------ |
| `repo`       | `string`           | `[forge:]owner/repo[@ref][#subpath]` |
| `path`       | `string`           | Path relative to repo root           |
| `lines`      | `[number, number]` | 0-indexed range                      |
| `head_bytes` | `number`           | First N bytes only                   |

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
summary: App Router uses file-system based routing. Layouts wrap pages; loading.tsx renders during streaming.
---

# Routing

App Router uses file-system based routing…
```

Files >200 KB without `lines` / `head_bytes` get a 4 KB preview plus instructions for the partial-read flags.

---

## `search_docs(repo, query, opts?)`

BM25+ search over a snapshot's docs files. Index is built lazily on first call, persisted by commit sha.

**Input**

| Field           | Type                                  | Default | Notes                      |
| --------------- | ------------------------------------- | ------- | -------------------------- |
| `repo`          | `string`                              | —       | `[forge:]owner/repo[@ref]` |
| `query`         | `string`                              | —       | Free-text                  |
| `limit`         | `number`                              | `10`    | Max hits                   |
| `fields`        | `("title" \| "headings" \| "body")[]` | all     | Restrict the search        |
| `snippet_chars` | `number`                              | `240`   | Snippet width              |

**Output**

```markdown
# Search: "middleware" in vercel/next.js@v15.0.0  (8 hits, 0.04s)

1. docs/01-app/01-getting-started/15-deploying/middleware.mdx  · score 12.4
   > Middleware lets you run code before a request is completed…
   `fetch_doc("vercel/next.js@v15.0.0", "docs/.../middleware.mdx")`

2. …
```

---

## `search_all(query, opts?)`

Fan-out search across many repos in one call. Reuses per-repo indexes.

**Input**

| Field            | Type       | Default | Notes                                                        |
| ---------------- | ---------- | ------- | ------------------------------------------------------------ |
| `query`          | `string`   | —       | Free-text                                                    |
| `repos`          | `string[]` | —       | Explicit list of repo specs                                  |
| `from_lockfile`  | `boolean`  | `false` | Resolve every direct dep in the cwd lockfile and search them |
| `limit_per_repo` | `number`   | `3`     | Per-repo hit cap                                             |
| `total_limit`    | `number`   | `15`    | Cross-repo hit cap                                           |
| `snippet_chars`  | `number`   | `200`   | Snippet width                                                |

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

| Field  | Type     | Default |
| ------ | -------- | ------- |
| `repo` | `string` | —       |
| `path` | `string` | —       |
| `n`    | `number` | `40`    |

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

| Field      | Type     | Notes                               |
| ---------- | -------- | ----------------------------------- |
| `repo`     | `string` | `owner/repo`                        |
| `from_ref` | `string` | Older version heading to slice from |
| `to_ref`   | `string` | Newer version heading to slice to   |

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

| Field   | Type                          | Default  |
| ------- | ----------------------------- | -------- |
| `repo`  | `string`                      | —        |
| `query` | `string`                      | —        |
| `state` | `"open" \| "closed" \| "all"` | `"open"` |
| `type`  | `"issue" \| "pr" \| "both"`   | `"both"` |
| `limit` | `number`                      | `5`      |

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
