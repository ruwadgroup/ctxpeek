/**
 * Fetch strategy — the ordered fallback chain that defines docpilot's
 * rate-limit posture.
 *
 *   Step 0  cache hit                     → free
 *   Step 1  REST contents + ETag (304)    → free if authed
 *   Step 2  jsDelivr CDN (commit-pinned)  → unmetered against GH
 *   Step 3  REST blob by sha              → metered (fallback for >1MB files)
 *   Step 4  GraphQL alias batch (≥4 files)→ ~2 points
 *
 * Design doc §4 for numbers and rationale.
 */
import { CdnUnavailableError, type Forge, NotFoundError } from "@docpilot/core";
import type { BlobStore } from "../cache/blobs.js";
import type { EtagStore } from "../cache/etag.js";
import { etagKey } from "../cache/etag.js";
import { blobKey, type Logger } from "../util/index.js";
import type { ForgeClient, ForgeRegistry } from "./forgeClient.js";
import { pickForge } from "./forgeClient.js";
import type { GithubGraphqlClient } from "./githubGraphql.js";
import type { TreeApiResult } from "./githubRest.js";
import type { JsDelivrClient } from "./jsdelivr.js";
import type { RateLimiter } from "./ratelimit.js";

export type FetchOptions = {
  readonly preferCdn: boolean;
  readonly cdnEnabled: boolean;
};

export type FetchResult = {
  readonly bytes: Uint8Array;
  readonly etag: string | undefined;
  readonly source: "cache" | "rest" | "cdn" | "graphql";
};

export type FetchContext = {
  readonly forges: ForgeRegistry;
  readonly cdn: JsDelivrClient;
  readonly graphql: GithubGraphqlClient | null;
  readonly blobs: BlobStore;
  readonly etags: EtagStore;
  readonly limiter: RateLimiter;
  readonly logger: Logger;
};

function clientFor(ctx: FetchContext, forge: Forge): ForgeClient {
  return pickForge(ctx.forges, forge);
}

export async function fetchBlob(
  ctx: FetchContext,
  owner: string,
  repo: string,
  commitSha: string,
  filePath: string,
  opts: FetchOptions,
  forge: Forge = "github",
): Promise<FetchResult> {
  const cacheSha = blobKey(`${forge}:${commitSha}`, filePath);
  const cacheHit = await ctx.blobs.has(cacheSha);
  if (cacheHit) {
    const bytes = await ctx.blobs.read(cacheSha);
    ctx.logger.debug("fetch: cache hit", { path: filePath, forge });
    return { bytes, etag: undefined, source: "cache" };
  }

  const client = clientFor(ctx, forge);

  const tryRest = async (): Promise<FetchResult | null> => {
    try {
      const key = etagKey(owner, repo, commitSha, filePath);
      const cachedEtag = await ctx.etags.get(key);
      const result = await client.getContents(owner, repo, filePath, commitSha, cachedEtag);
      if (result.status === 304 && cachedEtag) {
        if (cacheHit) {
          const bytes = await ctx.blobs.read(cacheSha);
          return { bytes, etag: cachedEtag, source: "cache" };
        }
        return null;
      }
      if (result.status === 200 && result.bytes) {
        await ctx.blobs.write(cacheSha, result.bytes);
        if (result.etag) await ctx.etags.put(key, result.etag);
        return { bytes: result.bytes, etag: result.etag, source: "rest" };
      }
      if (result.status === 404)
        throw new NotFoundError(`${forge}:${owner}/${repo}/${filePath}@${commitSha}`);
      return null;
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      ctx.logger.debug("fetch: REST contents failed", {
        path: filePath,
        forge,
        err: String(err),
      });
      return null;
    }
  };

  const tryCdn = async (): Promise<FetchResult | null> => {
    if (!opts.cdnEnabled) return null;
    const cdnUrl = client.cdnUrl(owner, repo, commitSha, filePath);
    if (!cdnUrl) return null;
    try {
      const bytes =
        forge === "github"
          ? await ctx.cdn.fetchFile(owner, repo, commitSha, filePath)
          : await ctx.cdn.fetchByUrl(cdnUrl);
      await ctx.blobs.write(cacheSha, bytes);
      return { bytes, etag: undefined, source: "cdn" };
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      if (err instanceof CdnUnavailableError) {
        ctx.logger.warn("fetch: CDN unavailable", {
          path: filePath,
          err: String(err),
        });
        return null;
      }
      ctx.logger.debug("fetch: CDN failed", {
        path: filePath,
        err: String(err),
      });
      return null;
    }
  };

  const order: Array<() => Promise<FetchResult | null>> = [];
  // CDN-first is now the default for GitHub when CDN is enabled. We pin
  // every fetch to a commit SHA, so jsDelivr always has an immutable URL —
  // there's no consistency win from going REST-first, only a budget cost.
  // ETag savings only mattered on cache re-validation, but cache hits
  // short-circuit before this function runs. REST stays as fallback.
  const cdnFirst =
    opts.preferCdn ||
    !client.hasToken() ||
    ctx.limiter.isDegraded() ||
    (forge === "github" && opts.cdnEnabled);
  if (cdnFirst) {
    order.push(tryCdn);
    order.push(tryRest);
  } else {
    order.push(tryRest);
    order.push(tryCdn);
  }

  for (const step of order) {
    const result = await step();
    if (result) return result;
  }

  throw new NotFoundError(`unable to fetch ${forge}:${owner}/${repo}/${filePath}@${commitSha}`);
}

export async function fetchTree(
  ctx: FetchContext,
  owner: string,
  repo: string,
  commitSha: string,
  forge: Forge = "github",
): Promise<TreeApiResult> {
  return clientFor(ctx, forge).getTree(owner, repo, commitSha, true);
}

export type BatchFetchOptions = FetchOptions & {
  /** Force GraphQL when this many files are missing from cache. */
  readonly graphqlThreshold?: number;
};

/**
 * Fetch many files. Uses GraphQL when a fresh batch ≥ graphqlThreshold and a
 * token is available; falls back to per-file fetch. Results are returned in
 * input order.
 */
export async function fetchManyBlobs(
  ctx: FetchContext,
  owner: string,
  repo: string,
  commitSha: string,
  paths: ReadonlyArray<string>,
  opts: BatchFetchOptions,
  forge: Forge = "github",
): Promise<ReadonlyArray<FetchResult>> {
  const threshold = opts.graphqlThreshold ?? 4;
  const results: FetchResult[] = Array.from({
    length: paths.length,
  }) as FetchResult[];
  const missing: { idx: number; path: string }[] = [];

  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    if (p === undefined) continue;
    const sha = blobKey(`${forge}:${commitSha}`, p);
    if (await ctx.blobs.has(sha)) {
      const bytes = await ctx.blobs.read(sha);
      results[i] = { bytes, etag: undefined, source: "cache" };
    } else {
      missing.push({ idx: i, path: p });
    }
  }

  if (forge === "github" && missing.length >= threshold && ctx.graphql) {
    try {
      const batched = await ctx.graphql.batchBlobs(
        owner,
        repo,
        commitSha,
        missing.map((m) => m.path),
      );
      for (let i = 0; i < batched.length; i++) {
        const b = batched[i];
        const m = missing[i];
        if (!b || !m) continue;
        if (b.text !== null) {
          const bytes = new Uint8Array(Buffer.from(b.text, "utf8"));
          await ctx.blobs.write(blobKey(`${forge}:${commitSha}`, m.path), bytes);
          results[m.idx] = { bytes, etag: undefined, source: "graphql" };
        }
      }
    } catch (err) {
      ctx.logger.warn("fetch: GraphQL batch failed, falling back", {
        err: String(err),
      });
    }
  }

  for (const m of missing) {
    if (results[m.idx]) continue;
    results[m.idx] = await fetchBlob(ctx, owner, repo, commitSha, m.path, opts, forge);
  }

  return results;
}
