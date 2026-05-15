# Architecture

What happens when an MCP client invokes a docpilot tool, layer by layer. The whole thing is small enough to read in one sitting.

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
│  │  Tools   │  │  Resolver│  │ Docs tree  │ │
│  │  layer   │  │ (registry│  │ + fetch    │ │
│  │          │  │  +github)│  │            │ │
│  └────┬─────┘  └────┬─────┘  └─────┬──────┘ │
│       │             │              │        │
│  ┌────▼─────────────▼──────────────▼──────┐ │
│  │       Fetch Strategy                   │ │
│  │  Cache → CDN(jsDelivr) → REST/ETag     │ │
│  └────────────────┬───────────────────────┘ │
│                   │                         │
│  ┌────────────────▼───────────────────────┐ │
│  │  Snapshot-Addressed Cache              │ │
│  │  env-paths(docpilot) / refs / blobs    │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## Invariants

- **All state is on disk**, under `env-paths('docpilot').cache`. No daemon, no port.
- **Blobs are snapshot-addressed** by sha256 of `(forge, commit-sha, path)`. Repeat reads of the same file at the same commit are local.
- **A repo is a "snapshot"**: `(forge, owner, repo, commit-sha)`. Refs (`main`, `v15`, `latest`) resolve to a sha at the start of each tool call; downstream operations operate on the sha.
- **Docs navigation is tree-first.** `list_docs` returns the repo's docs tree; the model picks a path and calls `fetch_doc`.
- **Multi-forge from the start.** GitHub, GitLab, Bitbucket all ship in v0.1; new forges are one file via `defineForge`.

## Layer by layer

### 1. MCP transport (`src/server.ts`)

A single Node process speaking JSON-RPC over stdio. Each tool from `src/tools/*` registers with the MCP SDK. No SSE, no HTTP, no shared state across server instances.

### 2. Tools layer (`src/tools/`)

Each tool is a thin orchestrator: validate input with zod, call into the right combination of resolver / cache / fetch, render the result as markdown, return.

Tool descriptions are written so the model **defaults** to calling docpilot when the user mentions a library. No magic incantation.

### 3. Resolver (`src/resolve/`) <a id="resolver"></a>

Turns fuzzy names into canonical `owner/repo`. Algorithm:

```
function resolve_repo(query, hint?):
  q = normalize(query)
  if q is "owner/repo" shape:           return verify_on_github(q)

  # Manifest preflight: if the cwd has a lockfile and the query matches a
  # dep by name or scope (e.g. "autotranslate" → @autotranslate/cli),
  # resolve that exact package instead of the bare query.
  manifest_hit = find_manifest_match(q)
  if manifest_hit:                      q = manifest_hit.name

  if cache.has(q) and not force_refresh: return cache.get(q)

  candidates = race([                   # parallel, ~1.5s each, with GH search side-channel
    npm registry,
    pypi,
    crates.io,
    pkg.go.dev (HTML scrape),
    rubygems,
    packagist,
    hex,
  ])

  if any returns github.com URL:
    winner = verify_and_enrich(that)    # getRepo → fills stars + defaultBranch + latestTag
    if winner:                          return winner + gh_search_alternatives

  # No registry winner: GH /search/repositories (30/min separate bucket)
  results = github_search(q)
  if no results:                        return NotFound

  top = sorted_by_stars(results)[0]
  latest_tag = tryGetLatestTag(top)     # one /releases/latest call

  dominant = !second || top.stars > 10 × second.stars
  if dominant:                          confidence = 0.85
  elif top.stars >= 5000:               confidence = 0.9   # popular-enough → trust it
  else:                                 confidence = 0.55  # ambiguous, markdown picker
```

The resolution cache stores verified GitHub metadata (`stars`, `defaultBranch`, `latestTag`, `confidence`) and has a 30-day TTL per entry. Releases shipped inside that window can leave `latestTag` stale until `force_refresh` or the entry expires.

### 4. Fetch strategy (`src/fetch/`)

For each blob we need, docpilot tries paths in this order. Every miss falls through to the next.

| #   | Path                                            | Cost                            | When                                                                 |
| --- | ----------------------------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| 0   | local cache                                     | free                            | Always tried first                                                   |
| 1   | jsDelivr CDN `cdn.jsdelivr.net/gh/o/r@sha/path` | 0 against GH                    | GitHub when CDN is enabled; GitLab when preferred or unauthenticated |
| 2   | REST `/contents/{path}` with `If-None-Match`    | 0 on 304 (authed) / 1 on change | CDN miss, CDN disabled, or forge has no CDN                          |

Concrete impact for `vercel/next.js@v15`, 50 files:

| Approach                     | API calls                  | Rate-limit impact                 |
| ---------------------------- | -------------------------- | --------------------------------- |
| Naive REST contents per file | 50                         | 50 / 5,000                        |
| Tree + CDN                   | 0-1 forge API calls        | Scales to thousands of file reads |
| Warm cache                   | 0                          | Local filesystem reads            |
| REST fallback with ETag      | 0 on authed 304 / 1 on 200 | Useful when CDN is unavailable    |

For a **second** invocation against the same commit, the blob and tree caches bring incremental network cost to zero.

### 5. Cache (`src/cache/`)

```
${env-paths('docpilot').cache}/
├── blobs/
│   └── ab/ab12cdef…           snapshot/path-keyed bytes
├── refs/
│   └── vercel--next.js/
│       ├── HEAD.json
│       └── tree-{sha}.json
├── resolutions.json           versioned schema (owner/repo + verified metadata)
├── repo-meta.json             7-day cache of getRepo() results
├── etag-map.json
├── limiter-state.json
└── meta.json
```

Manual GC evicts old blobs first, then oldest blobs until the configurable cap is met. JSON store writes are guarded with `proper-lockfile`; blob writes are atomic temp-file renames. Reads are lock-free.

Snapshot-addressing means repeated reads at the same commit are direct. Two refs that share identical bytes can still store separate blob entries today.

### 6. Format (`src/format/`)

Markdown renderers — tree and frontmatter. The MCP spec says `text` blocks are free-form, so we use markdown rather than JSON inside a string. Measured: ≈75% fewer tokens than equivalent JSON for a docs tree.

## Why this shape

A few decisions worth calling out:

### Why an IR-free design?

Tools render markdown directly. Adding an IR layer would add abstraction without enabling polyglot clients (the MCP transport already isolates us). When we need structured output for chaining (`resolve_repo`'s `structuredContent`), it lives next to the markdown, validated by the same zod schema.

### Why no semantic search or vector store? A deliberate choice.

When models weren't agentic, query → top-k was the right shape. Hand the model a relevance-ranked slice because it couldn't go fetch more itself. A vector store solved that — map the corpus into similarity space, return the nearest chunks to the user's question, hope a few of them were on-topic.

Today's clients are agentic. They list a tree, read a path, decide whether it's what they wanted, and call again. The right primitive for _that_ shape isn't "guess what the answer looks like and dump six chunks" — it's "show me the structure of these docs and let me navigate." If a repo was written for a human to navigate (filenames, folder hierarchy, llms.txt, README headings), it's already navigable by an agent. The corpus author has _already_ encoded relevance — embeddings just re-derive a lossier version of it.

So docpilot leans on what's already there. `list_docs` shows the tree. `fetch_doc` returns the file. The agent decides what's relevant — not a cosine similarity over text we don't own. If a library's docs are too unstructured for that to work, the right answer is to ask the library to write better docs (or contribute an `llms.txt`), not to paper over it with vectors.

### Why CDN as a first-class fallback?

Unauthenticated `raw.githubusercontent.com` is rate-limited and offers no documented auth path. jsDelivr permanently caches commit-pinned URLs, so anonymous docpilot users can pull thousands of files per hour with zero impact on GitHub's anonymous bucket.

### Why no hosted docs corpus?

The boundary is not "never use a server for anything." A cache mirror or CDN can be compatible if it serves immutable public bytes and the client still verifies what it receives.

The boundary is: docpilot does not make a hosted corpus, resolver, ranking model, or authoring layer the authority for documentation. The authority is the git snapshot named by `[forge:]owner/repo[@ref][#subpath]`. If a hosted service decides which library, version, snippets, or instructions the model sees, docpilot has stopped being ref-native source access and has become a different product.

### Non-goals (so the surface stays small)

- **No vector store, no embeddings.** See above.
- **No hosted docs corpus or hosted resolver as the authority.** See above.
- **No curated library registry.** If a library has a public repo on a supported forge, docpilot can read it. We're never building a "trusted libraries" list.
- **No write operations.** No `create_issue`, no `commit`, no `pr`. Adjacent to scope.
- **No source-code understanding.** docpilot is for documentation. Symbol-level navigation is `github-mcp-server`'s job.

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
- [`packages/docpilot/src/tools/`](../../packages/docpilot/src/tools/) — MCP tool implementations
- [`packages/docpilot/src/fetch/strategy.ts`](../../packages/docpilot/src/fetch/strategy.ts) — local cache + CDN + REST fallback chain
- [`packages/docpilot/src/fetch/forges/`](../../packages/docpilot/src/fetch/forges/) — GitHub / GitLab / Bitbucket adapters
- [`packages/docpilot/src/resolve/orchestrator.ts`](../../packages/docpilot/src/resolve/orchestrator.ts)
- [`packages/docpilot/src/lockfile.ts`](../../packages/docpilot/src/lockfile.ts) — manifest detection façade
- [`packages/docpilot/src/cache/`](../../packages/docpilot/src/cache/)
- [`packages/docpilot-core/`](../../packages/docpilot-core/)

If you read those and still have a "wait, how does X work?" question, that's a docs bug. Please file it.
