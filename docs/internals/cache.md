# Cache

The cache is the difference between docpilot feeling instant and docpilot feeling like one network round-trip per file. End-user view is in [`guides/caching.md`](../guides/caching.md); this is the internals.

## Layout

```
${env-paths('docpilot').cache}/
├── blobs/
│   └── ab/
│       └── ab12cdef…             raw bytes, keyed by snapshot/path hash
├── refs/
│   └── vercel--next.js/
│       ├── HEAD.json             { ref, sha, etag, fetched_at }
│       ├── v15.0.0.json
│       └── tree-{sha}.json       cached tree (compact)
├── resolutions.json              versioned schema; owner/repo + verified metadata
├── repo-meta.json                7-day cache of getRepo() (stars, defaultBranch, latestTag)
├── etag-map.json                 path@sha → ETag
├── limiter-state.json            persisted rate-limit/degraded state
└── meta.json                     reserved cache metadata
```

## Snapshot-addressed blobs

The main blob cache is keyed by `sha256(forge:commit_sha:path)`, not by content hash. That makes the cache lookup a pure function of the resolved snapshot and requested path.

The tradeoff is intentional for the current baseline: identical bytes across two refs can be duplicated, but reads are direct and there is no extra indirection layer to maintain.

The on-disk layout uses two-character bucket directories (like git's loose-object store) to keep directory sizes bounded for filesystems that degrade past ~10k entries per directory.

## Refs

A `RefStore` entry maps `(owner, repo, ref)` → `{ sha, etag, fetched_at }`. Refs are never the source of truth for content — they are pointers to commit shas, which are the actual snapshot identifiers downstream.

Ref records are cached for 24 hours by `resolveSnapshot`. Tree records are keyed by the resolved commit sha and reused until GC removes them.

## ETags

`etag-map.json` is a flat map from `{owner}/{repo}/{path}@{sha}` to its ETag. Used by Step 1 of the [fetch strategy](fetch-strategy.md) to send `If-None-Match` on every conditional GET.

Authenticated 304 responses do **not** count against the primary rate limit. The hot path prefers local cache hits, but ETags still reduce cost when docpilot falls back to REST and has a previous validator.

## GC

- Blob entries older than the configured age (default 14 days) are removed first.
- If the blob cache still exceeds the configured cap (default 1 GiB), oldest remaining blobs are removed until it fits.
- Ref/tree files older than twice the configured age are removed.
- Resolutions older than 30 days are re-resolved on next use.

GC currently runs manually:

- `docpilot cache gc`

## Concurrency

Single-writer per snapshot via filesystem advisory lock (`proper-lockfile`). Reads are lock-free.

A failed/abandoned writer (process killed mid-write) leaves a stale lock. `proper-lockfile` handles this with a configurable lock file age (default 10 s).

## Migration

The current cache files are JSON and blob files with simple versioned records where needed. No automatic cache migration path has shipped yet; incompatible future changes should either tolerate old files or document when users need to run `docpilot cache gc` or remove the cache directory.
