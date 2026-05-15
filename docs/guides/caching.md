# Caching

docpilot keeps everything on disk. No in-memory daemon, no background process, no shared state across server instances.

## Where

The cache lives at `env-paths('docpilot').cache`, which resolves to:

| OS      | Default path                    |
| ------- | ------------------------------- |
| macOS   | `~/Library/Caches/docpilot`     |
| Linux   | `~/.cache/docpilot` (XDG)       |
| Windows | `%LOCALAPPDATA%\docpilot\Cache` |

Override with `--cache-dir <path>` or `[cache] dir = "..."` in `.docpilot.toml`.

## What

```
${cache}/
├── blobs/
│   └── ab/ab12cdef…              raw bytes, keyed by snapshot/path hash
├── refs/
│   └── vercel--next.js/
│       ├── HEAD.json             { ref, sha, etag, fetched_at }
│       ├── v15.0.0.json
│       └── tree-{sha}.json       cached tree, compact
├── resolutions.json              fuzzy-name → canonical owner/repo (versioned)
├── repo-meta.json                7-day cache of GitHub repo metadata
├── etag-map.json                 path@sha → ETag
├── limiter-state.json            persisted rate-limit/degraded state
└── meta.json                     reserved cache metadata
```

## Why snapshot-addressed?

Blob entries are keyed by `sha256(forge:commit_sha:path)`. That keeps reads simple and deterministic: once a tool resolves a ref to a commit, the same file at that commit is a local read. Identical bytes across different refs may be stored more than once; keeping the cache easy to reason about matters more than deduplicating every byte in the current baseline.

## Garbage collection

- Manual LRU eviction over a configurable cap (default **1 GiB**)
- Blob entries older than **14 days** evicted first
- Ref/tree entries older than twice that age are removed during GC
- Resolutions older than **30 days** are re-resolved on next use

Force a GC pass:

```bash
npx -y docpilot cache gc
```

Inspect cache state:

```bash
npx -y docpilot cache status
npx -y docpilot cache status vercel/next.js
```

## Concurrency

A single docpilot server is a single process; multiple clients calling the same server share a process. Multiple processes (one per MCP client) coordinate via filesystem advisory locks (`proper-lockfile`) — single-writer per snapshot, lock-free reads.

## Freshness model

Refs are resolved to commit shas before a tool reads docs. Branch/default refs are cached for 24 hours; tags and shas still point at immutable snapshots in normal forge workflows. Pin `@v1.2.3` or a commit sha for reproducibility.

For a repo with frequent docs churn, expect:

- First fetch: ref resolution + tree fetch + any requested file reads
- Repeat fetches at the same commit: local cache hits
- CDN misses or disabled CDN: REST fallback, using ETags when available

See [`docs/internals/fetch-strategy.md`](../internals/fetch-strategy.md) for the precise fallback chain.
