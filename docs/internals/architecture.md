# Architecture

This is what happens when an MCP client invokes a docpilot tool. The parts are small enough to read in one sitting.

## The 30-second mental model

```
┌─────────────────────────────────────────────┐
│  MCP Client (Claude Desktop / Code, Cursor, │
│  Windsurf, VS Code, Codex CLI, …)           │
└───────────────────┬─────────────────────────┘
                    │ JSON-RPC over stdio
┌───────────────────▼─────────────────────────┐
│  docpilot (Node ≥20, single process)        │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │  Tools   │  │  Resolver│  │  Indexer   │ │
│  │  layer   │  │ (registry│  │ (minisearch│ │
│  │          │  │  +github)│  │   BM25+)   │ │
│  └────┬─────┘  └────┬─────┘  └─────┬──────┘ │
│       │             │              │        │
│  ┌────▼─────────────▼──────────────▼──────┐ │
│  │       Fetch Strategy                   │ │
│  │  REST+ETag → CDN(jsDelivr) → GraphQL   │ │
│  └────────────────┬───────────────────────┘ │
│                   │                         │
│  ┌────────────────▼───────────────────────┐ │
│  │  Content-Addressed Cache               │ │
│  │  env-paths(docpilot) / blobs / sha256  │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## Invariants

- **All state is on disk**, under `env-paths('docpilot').cache`. No daemon, no port.
- **Blobs are content-addressed** by sha256 of bytes. Re-fetches that 304 are free.
- **A repo is a "snapshot"**: `(owner, repo, commit-sha)`. Refs (`main`, `v15`, `latest`) resolve to a sha at the start of each tool call; downstream operations operate on the sha.
- **The index is per snapshot.** Re-indexing is incremental (MiniSearch supports add/remove).

## Layer by layer

### 1. MCP transport (`src/server.ts`)

A single Node process speaking JSON-RPC over stdio. The server registers each tool from `src/tools/*` with the MCP SDK, plus a small set of `notifications/progress` for long operations. No SSE, no HTTP, no shared state across server instances.

### 2. Tools layer (`src/tools/`)

Each tool is a thin orchestrator: validate input with zod, call into the right combination of resolver / cache / fetch / index, render the result as markdown, return.

Tool descriptions are written so that the model **defaults** to calling docpilot when the user mentions a library — no incantation required.

### 3. Resolver (`src/resolve/`) <a id="resolver"></a>

Turns fuzzy names into canonical `owner/repo`. Algorithm:

```
function resolve_repo(query, hint?):
  q = normalize(query)
  if q is "owner/repo" shape:           return verify_on_github(q)
  if cache.has(q):                      return cache.get(q)
  candidates = race([                   # parallel, 250ms each
    npm registry,
    pypi,
    crates.io,
    pkg.go.dev (HTML scrape),
    rubygems,
    packagist,
    hex,
  ])
  if any returns github.com URL:        return that
  results = github /search/repositories (30/min separate bucket)
  if no results:                        return NotFound
  if top.stars > 10 × #2.stars:         return top
  return Ambiguous(top_5)               # markdown list, model picks
```

When ambiguous, the result is markdown with the top 5 candidates and lets the model (or human) pick. Auto-picking by stars alone produced bad results in pilot testing (e.g., `"vue"` → `vuejs/vue` legacy v2 when user wanted `vuejs/core`).

### 4. Fetch strategy (`src/fetch/`)

For each blob we need, docpilot tries paths in this order. Every miss falls through to the next.

| #   | Path                                            | Cost                            | When                                   |
| --- | ----------------------------------------------- | ------------------------------- | -------------------------------------- |
| 0   | local cache                                     | free                            | Always tried first                     |
| 1   | REST `/contents/{path}` with `If-None-Match`    | 0 on 304 (authed) / 1 on change | Every call against an authed user      |
| 2   | jsDelivr CDN `cdn.jsdelivr.net/gh/o/r@sha/path` | 0 against GH                    | No PAT, or file >100 KB                |
| 3   | REST tree + blob                                | 1 each                          | Tree walks; binary or very large files |
| 4   | GraphQL alias batch                             | 1–3 points total                | ≥4 cold-fetch files at once            |

Concrete impact for `vercel/next.js@v15`, 50 files:

| Approach                         | API calls                 | Rate-limit impact              |
| -------------------------------- | ------------------------- | ------------------------------ |
| Naive REST contents per file     | 50                        | 50 / 5,000                     |
| ETag REST + 304s after first run | 50 cold, **5 thereafter** | -90% on subsequent sessions    |
| Tree + CDN                       | 1 tree call + 0 (CDN)     | 1 / 5,000, scales to thousands |
| GraphQL alias batch              | 1 query, ~2 points        | 2 / 5,000                      |

For a **second** invocation against the same repo, ETag round-trips alone bring incremental cost to near zero.

### 5. Cache (`src/cache/`)

```
${env-paths('docpilot').cache}/
├── blobs/
│   └── ab/ab12cdef…           sha256-keyed bytes
├── refs/
│   └── vercel--next.js/
│       ├── HEAD.json
│       └── tree-{sha}.json
├── indexes/
│   └── {owner}--{repo}--{sha}.minisearch
├── resolutions.json
├── etag-map.json
└── meta.json
```

LRU eviction over a configurable cap (default 1 GiB). Single-writer per snapshot via `proper-lockfile`. Reads are lock-free.

Content-addressing means two refs that share files share storage. A new release of a 50 MB repo costs only the diff. Every cached byte is verifiable against its sha.

### 6. Search index (`src/search/`)

`minisearch` 7.x with BM25+. Per file:

- `title` — first `# heading` or filename stem
- `headings` — concatenated `## …`
- `body` — full text, code blocks weighted 0.5×
- `path` — boost 3× for slug matches

Built lazily on first `search_docs` call for a snapshot; persisted with `MiniSearch.toJSON()` for fast warm starts. Per-snapshot footprint: typically 5–15% of source-text size.

### 7. Format (`src/format/`)

Markdown renderers — tree, search hits, frontmatter. The MCP spec says `text` blocks are free-form, so we use markdown rather than JSON inside a string. Measured: ≈75% fewer tokens than equivalent JSON for a docs tree.

## Why this shape

A few decisions worth calling out:

**Why an IR-free design?** Tools render markdown directly. Adding an IR layer would add abstraction without enabling polyglot clients (the MCP transport already isolates us). When we need structured output for chaining (e.g., `resolve_repo`'s `structuredContent`), it lives next to the markdown, validated by the same zod schema.

**Why MiniSearch instead of a vector store?** BM25+ is good enough for docs corpora typically ≤10 MB per repo. Vectors are a v0.3+ opt-in experiment — when added, they will be local (`transformers.js`), never sent anywhere.

**Why CDN as a first-class fallback?** Unauthenticated `raw.githubusercontent.com` is rate-limited and offers no documented auth path. jsDelivr permanently caches commit-pinned URLs, so anonymous docpilot users can pull thousands of files per hour with zero impact on GitHub's anonymous bucket.

**Why no SaaS?** If we run a server, we become Context7. The whole pitch is "no third party can author content delivered through docpilot." A hosted endpoint breaks that.

## Plug-in registries

Three `define*` factories let contributors extend docpilot by adding **one file** — no other code in the repo needs to change. See [`docs/guides/extending.md`](../guides/extending.md) for end-to-end examples.

| Concern                                           | Helper                 | Files live in             |
| ------------------------------------------------- | ---------------------- | ------------------------- |
| Git forge (GitHub, GitLab, Bitbucket, Codeberg …) | `defineForge`          | `src/fetch/forges/`       |
| Lockfile parser (npm, PyPI, crates, Swift …)      | `defineLockfileParser` | `src/lockfile/parsers/`   |
| Registry probe (npm, PyPI, Maven, NuGet …)        | `defineRegistry`       | `src/resolve/registries/` |

Each helper writes to a module-local `Map<string, Definition>`. Built-ins side-register on import. The respective `getX(id)` / `listX()` helpers expose the resulting registry to consumers.

## Where to read the code

- [`packages/docpilot/src/server.ts`](../../packages/docpilot/src/server.ts) — MCP entrypoint + CLI dispatch
- [`packages/docpilot/src/tools/`](../../packages/docpilot/src/tools/) — 12 tools, one file each
- [`packages/docpilot/src/fetch/strategy.ts`](../../packages/docpilot/src/fetch/strategy.ts) — REST + CDN + GraphQL fallback chain
- [`packages/docpilot/src/fetch/forges/`](../../packages/docpilot/src/fetch/forges/) — GitHub / GitLab / Bitbucket adapters
- [`packages/docpilot/src/resolve/orchestrator.ts`](../../packages/docpilot/src/resolve/orchestrator.ts)
- [`packages/docpilot/src/lockfile.ts`](../../packages/docpilot/src/lockfile.ts) — manifest detection façade
- [`packages/docpilot/src/cache/`](../../packages/docpilot/src/cache/)
- [`packages/docpilot/src/search/`](../../packages/docpilot/src/search/)
- [`packages/docpilot-core/`](../../packages/docpilot-core/)

If you read those and still have a "wait, how does X work?" question, that's a docs bug. Please file it.
