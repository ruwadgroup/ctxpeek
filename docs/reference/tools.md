# Tools reference

Every docpilot tool returns markdown `text` content unless explicitly noted. Tools whose output is plausibly chained programmatically (`resolve_repo`, optionally `list_docs`) also expose `structuredContent` validated against an `outputSchema`.

All input schemas use `zod` via `@modelcontextprotocol/sdk`.

---

## `resolve_repo(query, opts?)`

Turn a fuzzy library name into a canonical `owner/repo`.

**Input**

| Field | Type | Notes |
| --- | --- | --- |
| `query` | `string` | Required. Examples: `"next.js"`, `"drizzle orm"`, `"axum"` |
| `opts.ecosystem` | `"npm" \| "pypi" \| "crates" \| "go" \| "rubygems" \| "packagist" \| "hex"` | Bias the registry probe order |
| `opts.force_refresh` | `boolean` | Bypass the resolutions cache |

**Output**

```markdown
# Resolved "drizzle orm" → drizzle-team/drizzle-orm  (npm exact match)

repo:    drizzle-team/drizzle-orm
stars:   28.4k
default: main
latest:  v0.30.1 (2026-05-03)

Use: `list_docs("drizzle-team/drizzle-orm@v0.30.1")`

Alternative matches (lower confidence):
- drizzle-team/drizzle-kit (companion CLI)
- ponded/drizzle-orm-helpers (community fork)
```

When ambiguous (top result has stars < 10× #2), all candidates are returned and the model picks. Algorithm: see [`docs/internals/architecture.md`](../internals/architecture.md#resolver).

---

## `list_docs(repo, opts?)`

Markdown tree of docs files in a repo.

**Input**

| Field | Type | Notes |
| --- | --- | --- |
| `repo` | `string` | `owner/repo[@ref][#subpath]` |
| `opts.deep` | `boolean` | Include nested docs more than 4 levels deep |
| `opts.include_examples` | `boolean` | Sibling section for `/examples` and `/cookbook` |
| `opts.max_files` | `number` | Cap; default 500 |

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

✦ = high signal (in llms.txt or README index)
✦✦ = highlighted in repo's own docs nav
⚠️ = changed within last 7 days
```

---

## `fetch_doc(repo, path, opts?)`

Fetch one file with metadata frontmatter.

**Input**

| Field | Type | Notes |
| --- | --- | --- |
| `repo` | `string` | `owner/repo[@ref][#subpath]` |
| `path` | `string` | Path relative to repo root |
| `opts.lines` | `[number, number]` | 1-indexed inclusive range |
| `opts.head_bytes` | `number` | First N bytes only |

**Output**

```markdown
---
repo: vercel/next.js
ref: v15.0.0
commit: a3b1f7c
path: docs/01-app/02-routing.mdx
size: 8923
last_modified: 2026-04-22T14:33:00Z
~tokens: 2150
---

# Routing

App Router uses file-system based routing…
```

Files >200 KB without `lines` / `head_bytes` get a `peek` response plus instructions.

---

## `search_docs(repo, query, opts?)`

BM25+ search over a snapshot's docs files.

**Input**

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `repo` | `string` | — | `owner/repo[@ref]` |
| `query` | `string` | — | Free-text |
| `opts.limit` | `number` | `10` | Max hits |
| `opts.fields` | `("title" \| "headings" \| "body")[]` | all | Restrict the search |
| `opts.snippet_chars` | `number` | `240` | Snippet width |

**Output**

```markdown
# Search: "middleware" in vercel/next.js@v15.0.0  (8 hits, 0.04s)

1. docs/01-app/01-getting-started/15-deploying/middleware.mdx  · score 12.4
   > Middleware lets you run code before a request is completed…
   `fetch_doc("vercel/next.js@v15.0.0", "docs/.../middleware.mdx")`

2. …
```

---

## `peek(repo, path, n?)`

Cheap preview — first N lines.

| Field | Type | Default |
| --- | --- | --- |
| `repo` | `string` | — |
| `path` | `string` | — |
| `n` | `number` | `40` |

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

Sister tool: `get_changelog(repo, from_ref, to_ref)` — multi-file via `CHANGELOG.md` or commits touching docs paths.

---

## `doc_quality(repo)`

Scorecard for a repo's docs.

```markdown
# Doc quality: vercel/next.js@v15.0.0

llms.txt:        present (2.4 KB)
llms-full.txt:   present (412 KB)
README docs link: yes → https://nextjs.org/docs
nav config:      Mintlify (mint.json)
last docs commit: 3 days ago
size distribution: 187 files, p50 4.2k, p95 18k
```

---

## `cache_status(repo?)`

Diagnostic.

```markdown
# Cache status

cache dir:    /Users/you/Library/Caches/docpilot  (412 MiB / 1 GiB cap)
snapshots:    14 (3 evicted last gc)
hit rate:     93% (last 100 fetches)
github quota: 4983/5000 reset 2026-05-14T16:42:00Z
```
