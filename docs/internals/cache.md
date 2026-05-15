# Cache

The cache is the difference between docpilot feeling instant and docpilot feeling like one network round-trip per file. End-user view is in [`guides/caching.md`](../guides/caching.md); this is the internals.

## Layout

```
${env-paths('docpilot').cache}/
├── blobs/
│   └── ab/
│       └── ab12cdef…             raw bytes, sha256-keyed
├── refs/
│   └── vercel--next.js/
│       ├── HEAD.json             { ref, sha, etag, fetched_at }
│       ├── v15.0.0.json
│       └── tree-{sha}.json       cached tree (compact)
├── resolutions.json              versioned schema; owner/repo + verified metadata
├── repo-meta.json                7-day cache of getRepo() (stars, defaultBranch, latestTag)
├── etag-map.json                 path@sha → ETag
└── meta.json                     schema version, last-gc, …
```

## Content-addressed blobs

Blobs are keyed by `sha256(bytes)`. Two refs of the same repo share files (most do), so the blob store is a deduplicating layer: a new release of a 50 MB repo costs only the diff.

Every read verifies the bytes match the key. A corrupted or truncated write is caught on the next read; the entry is evicted and re-fetched.

The on-disk layout uses two-character bucket directories (like git's loose-object store) to keep directory sizes bounded for filesystems that degrade past ~10k entries per directory.

## Refs

A `RefStore` entry maps `(owner, repo, ref)` → `{ sha, etag, fetched_at }`. Refs are never the source of truth for content — they are pointers to commit shas, which are the actual snapshot identifiers downstream.

Symbolic refs (`main`, `canary`) carry a short TTL (default 5 minutes) on top of the ETag. Tag refs (`v15.0.0`) are immutable on GitHub and cached forever. Sha refs are obviously immutable.

## ETags

`etag-map.json` is a flat map from `{owner}/{repo}/{path}@{sha}` to its ETag. Used by Step 1 of the [fetch strategy](fetch-strategy.md) to send `If-None-Match` on every conditional GET.

Authenticated 304 responses do **not** count against the primary rate limit. This is why an authenticated docpilot user effectively has unlimited capacity for repeat reads.

## GC

- LRU eviction over a configurable cap (default 1 GiB)
- Snapshots not accessed in 14 days evicted first
- Resolutions older than 30 days re-resolved on next use

GC runs:

- On startup if the last GC was more than 24 hours ago
- Eagerly when the cache exceeds the cap
- Manually via `docpilot cache gc`

## Concurrency

Single-writer per snapshot via filesystem advisory lock (`proper-lockfile`). Reads are lock-free.

A failed/abandoned writer (process killed mid-write) leaves a stale lock. `proper-lockfile` handles this with a configurable lock file age (default 10 s).

## Migration

`meta.json` carries a schema version. On startup, if the on-disk schema is older than the binary's expected schema:

- **Patch bump (X.Y.Z → X.Y.Z+1):** in-place migration if any
- **Minor bump (X.Y → X.Y+1):** `meta.json` is upgraded; everything else compatible
- **Major bump (X → X+1):** print a warning; recommend `docpilot cache nuke`

We have not had to do a major bump. The intent is to go from now to v1.0 without one.
