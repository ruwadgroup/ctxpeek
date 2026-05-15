# Fetch strategy

The prescriptive part of the design. The difference between ctxpeek feeling pleasant or painful at scale comes down to the order in this chain.

## Numbers that drive the design

Verbatim from <https://docs.github.com>:

- _"Making a conditional request does not count against your primary rate limit if a 304 response is returned and the request was made while correctly authorized with an `Authorization` header."_
- Unauthenticated REST: **60 req/hr per IP**
- Authenticated PAT/OAuth: **5,000 req/hr**
- GraphQL: **5,000 points/hr** for resolver and issue-search calls when a token is available
- Tree API max: **100,000 entries / 7 MB** per `?recursive=1`. Returns `"truncated": true` past that.
- Secondary limits: **100 concurrent requests** across REST+GraphQL, **900 points/min REST**, **2,000 points/min GraphQL**, **≤90 s CPU per 60 s wall clock**
- LFS: **300 req/min unauth, 3,000 req/min auth**, batches of 100 LFS objects
- **Unauthenticated `raw.githubusercontent.com` is rate-limited as of 2025-05-08.** No documented way to authenticate to it.

## Fallback chain

For each blob, in the current implementation:

### Step 0 — Local cache hit

`(forge, commit_sha, path)` → blob present? Return it. **Cost: 0.**

### Step 1 — jsDelivr CDN, when available

```
https://cdn.jsdelivr.net/gh/{owner}/{repo}@{commit_sha}/{path}
https://cdn.jsdelivr.net/gl/{owner}/{repo}@{commit_sha}/{path}
```

GitHub uses CDN first whenever CDN reads are enabled. GitLab uses CDN first when preferred, unauthenticated, or rate-limit degraded. Bitbucket has no jsDelivr equivalent and skips this step.

jsDelivr permanently caches by commit-pinned URL. Limits: **50 MB per file** on the `/gh/` path. Branch-aliased URLs cache 12 h; tag-aliased 7 d; commit-pinned essentially forever. ctxpeek resolves refs to commit shas before fetching files.

**This is the main rate-limit win:** unauthenticated ctxpeek users can pull many GitHub docs files through jsDelivr with zero impact on GitHub's primary or anonymous limits.

A CDN 404 is not treated as final when a forge API fallback exists. Fresh public commits can take time to appear on the CDN, and private repos are not CDN-readable; both cases fall through to authenticated REST/ETag.

### Step 2 — Conditional GET on REST contents

When CDN is disabled, unavailable, or unsupported for the forge, ctxpeek calls the forge contents endpoint with `If-None-Match` if it has an ETag.

- **304** → use the cached body if present. Cost: **0** against GitHub primary rate limit when correctly authorized.
- **200** → save the new blob + ETag. Cost: **1**.

### Step 3 — Tree fetches

Tree fetches are separate from file fetches:

- GitHub tries jsDelivr's flat tree endpoint first when CDN is enabled, then falls back to REST trees.
- GitLab uses its repository tree endpoint.
- Bitbucket pages through `src/{sha}` up to the current cap.

GraphQL is not part of the file-content fetch chain. It is used by resolver and issue-search paths when a GitHub token is available.

## Tree truncation

For repos with >100k files (rare for docs use cases), GitHub REST can return `"truncated": true`. ctxpeek surfaces that state in `list_docs` and recommends using `#subpath` to scope the next call.

## Secondary-limit posture

- Hard cap of **8** concurrent in-flight requests to GitHub
- Token-bucket throttle at **60 req/min** to stay clear of the 900 pts/min endpoint limit
- Exponential backoff with configurable `Retry-After` honor on 429/5xx, max 3 retries by default
- `X-RateLimit-Remaining < 100` marks the limiter degraded; later fetches favor CDN where available

## Open tradeoffs

- **jsDelivr dependence.** Free CDN run by donations. Outage degrades us to authenticated REST (still works) or anonymous REST (degraded). Multi-CDN failover is not implemented in the current baseline.
- **`raw.githubusercontent.com` opacity.** Rate-limited since 2025-05-08; exact unauth quota undocumented. This is _why_ ctxpeek defaults to CDN for raw content even when a PAT is present.
- **GraphQL has no ETag.** For repeated file-content flows, local cache plus REST validators is the better fit. GraphQL stays out of blob fetches.
