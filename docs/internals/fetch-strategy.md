# Fetch strategy

This is the prescriptive part of the design — what makes docpilot pleasant or painful at scale.

## Numbers that drive the design

Verbatim from <https://docs.github.com>:

- _"Making a conditional request does not count against your primary rate limit if a 304 response is returned and the request was made while correctly authorized with an `Authorization` header."_
- Unauthenticated REST: **60 req/hr per IP**
- Authenticated PAT/OAuth: **5,000 req/hr**
- GitHub App on Enterprise Cloud org: up to **15,000 req/hr**
- GraphQL: **5,000 points/hr** (typical repo+tree+blob query: 1–5 points)
- Tree API max: **100,000 entries / 7 MB** per `?recursive=1`. Returns `"truncated": true` past that.
- Secondary limits: **100 concurrent requests** across REST+GraphQL, **900 points/min REST**, **2,000 points/min GraphQL**, **≤90 s CPU per 60 s wall clock**
- LFS: **300 req/min unauth, 3,000 req/min auth**, batches of 100 LFS objects
- **Unauthenticated `raw.githubusercontent.com` is rate-limited as of 2025-05-08.** No documented way to authenticate to it.

## Fallback chain

For each blob, in order:

### Step 0 — Local cache hit

`(commit_sha, path)` → blob present and fresh? Return it. **Cost: 0.**

### Step 1 — Conditional GET on REST `/repos/{o}/{r}/contents/{path}`

Send `If-None-Match: {etag}` from the ETag store.

- **304** → use cached body. Cost: **0** against primary rate limit (only if `Authorization` header present).
- **200** → save new blob + ETag. Cost: **1**.

### Step 2 — jsDelivr CDN

```
https://cdn.jsdelivr.net/gh/{owner}/{repo}@{commit_sha}/{path}
```

Used when:

- No PAT is configured (we'd otherwise hit `raw.githubusercontent.com`'s anonymous limit), or
- The file is over 100 KB and we want to avoid burning a REST call for content we don't need to revalidate frequently.

jsDelivr permanently caches by commit-pinned URL. Limits: **50 MB per file** on the `/gh/` path. Branch-aliased URLs cache 12 h; tag-aliased 7 d; commit-pinned essentially forever. docpilot always pins to a commit sha, so cache poisoning is not a concern.

**This is the most important rate-limit win:** unauthenticated docpilot users can pull thousands of docs files per hour through jsDelivr with zero impact on GitHub's primary or anonymous limits.

### Step 3 — REST tree + blob

For a directory walk: one `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1` (cost: 1 req, ≤100k entries). For files we want, prefer Step 2 (CDN). Use `/git/blobs/{sha}` only for binary or very-large files where CDN missed.

### Step 4 — GraphQL alias batch (last resort, but powerful)

When a session needs ≥4 docs files at once, a single GraphQL query with file aliases costs 1–3 points total versus 4+ REST requests:

```graphql
query DocBatch($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    readme: object(expression: "HEAD:README.md") { ... on Blob { text } }
    f1: object(expression: "HEAD:docs/getting-started.md") { ... on Blob { text } }
    f2: object(expression: "HEAD:docs/api.md") { ... on Blob { text } }
    # … up to ~50 aliases comfortably
  }
  rateLimit { remaining cost resetAt }
}
```

GraphQL has **no ETag support**, so we only use it when we already know we need fresh content (cache miss / version bump) and we have ≥4 files to fetch.

## Tree truncation

For repos with >100k files (rare for docs use cases), docpilot detects `"truncated": true` and falls back to incremental sub-tree fetches scoped to the `#subpath` parameter or detected docs directories (`docs/`, `documentation/`, `website/docs/`, `apps/docs/`).

## Secondary-limit posture

- Hard cap of **8** concurrent in-flight requests to GitHub
- Token-bucket throttle at **60 req/min** to stay clear of the 900 pts/min endpoint limit
- Exponential backoff with `Retry-After` honor on 429/403, max 5 retries
- Resource budget check: before each fetch, read `X-RateLimit-Remaining`. Below 100 → switch to CDN-only and emit a warning notification.

## Open tradeoffs

- **jsDelivr dependence.** Free CDN run by donations. Outage degrades us to authenticated REST (still works) or anonymous REST (degraded). Multi-CDN failover (`statically.io`, `raw.githack.com`) is documented but not implemented in v1.
- **`raw.githubusercontent.com` opacity.** Rate-limited since 2025-05-08; exact unauth quota undocumented. This is _why_ docpilot defaults to CDN for raw content even when a PAT is present.
- **GraphQL has no ETag.** For repeated-fetch flows, REST is unambiguously better. GraphQL wins only on cold-fetch batches.
