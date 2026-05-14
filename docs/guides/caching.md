# Caching

docpilot keeps everything on disk. There is no in-memory daemon, no background process, no shared state across server instances.

## Where

The cache lives at `env-paths('docpilot').cache`, which resolves to:

| OS | Default path |
| --- | --- |
| macOS | `~/Library/Caches/docpilot` |
| Linux | `~/.cache/docpilot` (XDG) |
| Windows | `%LOCALAPPDATA%\docpilot\Cache` |

Override with `DOCPILOT_CACHE_DIR` or `[cache] dir = "..."` in `.docpilot.toml`.

## What

```
${cache}/
├── blobs/
│   └── ab/ab12cdef…              raw bytes, sha256-keyed
├── refs/
│   └── vercel--next.js/
│       ├── HEAD.json             { ref, sha, etag, fetched_at }
│       ├── v15.0.0.json
│       └── tree-{sha}.json       cached tree, compact
├── indexes/
│   └── vercel--next.js--{sha}.minisearch
├── resolutions.json              fuzzy-name → canonical owner/repo
├── etag-map.json                 path@sha → ETag
└── meta.json                     schema version, last-gc, …
```

## Why content-addressed?

Two refs of the same repo share files (most do). The blob store keys by `sha256(bytes)`, so a new release of a 50 MB repo costs only the diff. Every cached byte is verifiable against its key — corrupted or partial writes are caught on the next read.

## Garbage collection

- LRU eviction over a configurable cap (default **1 GiB**)
- Snapshots not accessed in **14 days** evicted first
- Resolutions older than **30 days** re-resolved on next use

Force a GC pass:

```bash
npx -y docpilot-mcp cache gc
```

Inspect cache state:

```bash
npx -y docpilot-mcp cache status
npx -y docpilot-mcp cache status vercel/next.js
```

## Concurrency

A single docpilot server is a single process; multiple clients calling the same server share a process. Multiple processes (one per MCP client) coordinate via filesystem advisory locks (`proper-lockfile`) — single-writer per snapshot, lock-free reads.

## Freshness model

The TTL is **you**. ETag-revalidate-on-read means at most one round-trip stale. Pin `@main` to always get latest; pin `@v1.2.3` for reproducibility.

For a repo with frequent docs churn, expect:

- First fetch: 1–N REST calls + initial CDN reads
- Repeat fetches: free (304) when authenticated; CDN-cached when not

See [`docs/internals/fetch-strategy.md`](../internals/fetch-strategy.md) for the precise fallback chain.
