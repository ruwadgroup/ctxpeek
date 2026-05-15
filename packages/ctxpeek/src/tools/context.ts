// Shared service context — instantiated once at server boot, passed to every tool factory.

import type { BlobStore } from "../cache/blobs.js";
import type { EtagStore } from "../cache/etag.js";
import type { RefStore, TreeRecord } from "../cache/refs.js";
import type { RepoMetaCache } from "../cache/repoMeta.js";
import type { CtxpeekConfig } from "../config.js";
import { type Forge, NotFoundError, type Snapshot } from "../core/index.js";
import { type ForgeRegistry, pickForge } from "../fetch/forgeClient.js";
import type { GithubGraphqlClient } from "../fetch/githubGraphql.js";
import type { GithubRestClient } from "../fetch/githubRest.js";
import type { JsDelivrClient } from "../fetch/jsdelivr.js";
import type { RateLimiter } from "../fetch/ratelimit.js";
import type { FetchContext } from "../fetch/strategy.js";
import type { HttpClient, Logger } from "../util/index.js";
import { parseRepoSpec } from "../util/repoSpec.js";

export type ToolContext = {
  readonly config: CtxpeekConfig;
  readonly logger: Logger;
  readonly rest: GithubRestClient;
  readonly forges: ForgeRegistry;
  readonly graphql: GithubGraphqlClient | null;
  readonly cdn: JsDelivrClient;
  readonly limiter: RateLimiter;
  readonly blobs: BlobStore;
  readonly refs: RefStore;
  readonly etags: EtagStore;
  readonly http: HttpClient;
  readonly repoMeta: RepoMetaCache;
};

export function fetchContextFrom(ctx: ToolContext): FetchContext {
  return {
    forges: ctx.forges,
    cdn: ctx.cdn,
    graphql: ctx.graphql,
    blobs: ctx.blobs,
    etags: ctx.etags,
    limiter: ctx.limiter,
    logger: ctx.logger,
  };
}

export type ResolvedRepo = {
  readonly forge: Forge;
  readonly owner: string;
  readonly repo: string;
  readonly snapshot: Snapshot;
  readonly subpath: string | undefined;
};

/** Resolve a repo spec to a commit-pinned Snapshot. Caches `(forge, ref) → sha` for 24h. */
export async function resolveSnapshot(ctx: ToolContext, repoSpec: string): Promise<ResolvedRepo> {
  const spec = parseRepoSpec(repoSpec);
  const { forge, owner, repo } = spec;
  const client = pickForge(ctx.forges, forge);

  let ref = spec.ref;
  if (!ref) {
    try {
      const meta = await client.getRepo(owner, repo);
      ref = meta.defaultBranch;
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      ctx.logger.warn("snapshot: default-branch lookup failed, falling back to 'main'", {
        forge,
        err: String(err),
      });
      ref = "main";
    }
  }

  const cacheKey = `${forge}:${ref}`;
  const cached = await ctx.refs.resolve(owner, repo, cacheKey);
  const fresh = cached && isFresh(cached.fetchedAt, 24 * 60 * 60 * 1000);
  let sha: string;
  let committedAt = cached?.fetchedAt;
  if (fresh && cached) {
    sha = cached.sha;
  } else {
    const info = await client.resolveRef(owner, repo, ref);
    sha = info.sha;
    committedAt = info.committedAt;
    await ctx.refs.put({
      owner,
      repo,
      ref: cacheKey,
      sha,
      fetchedAt: new Date().toISOString(),
    });
  }

  const snapshot: Snapshot = {
    forge,
    owner,
    repo,
    commitSha: sha,
    requestedRef: ref,
    resolvedAt: committedAt ?? new Date().toISOString(),
  };

  return {
    forge,
    owner,
    repo,
    snapshot,
    subpath: spec.subpath,
  };
}

export async function getTreeCached(
  ctx: ToolContext,
  owner: string,
  repo: string,
  sha: string,
  forge: Forge = "github",
): Promise<TreeRecord> {
  const cacheKey = `${forge}-${sha}`;
  const cached = await ctx.refs.getTree(owner, repo, cacheKey);
  if (cached) return cached;

  // GitHub tree listings can come from jsDelivr's /flat endpoint for free —
  // no REST budget burned. Falls back to REST getTree on CDN failure (very
  // fresh commits sometimes 404, and the endpoint omits empty directories).
  if (forge === "github" && ctx.config.fetch.cdnEnabled) {
    try {
      const flat = await ctx.cdn.fetchFlatTree(owner, repo, sha);
      const record: TreeRecord = {
        owner,
        repo,
        commitSha: cacheKey,
        truncated: false,
        entries: flat.map((f) => ({
          path: f.name,
          type: "blob",
          size: f.size,
          sha: f.hash,
        })),
        fetchedAt: new Date().toISOString(),
      };
      await ctx.refs.putTree(record);
      return record;
    } catch (err) {
      ctx.logger.debug("getTreeCached: CDN flat listing unavailable, falling back to REST", {
        repo: `${owner}/${repo}`,
        sha,
        err: String(err),
      });
    }
  }

  const client = pickForge(ctx.forges, forge);
  const fresh = await client.getTree(owner, repo, sha, true);
  const record: TreeRecord = {
    owner,
    repo,
    commitSha: cacheKey,
    truncated: fresh.truncated,
    entries: fresh.tree
      .filter(
        (e): e is { path: string; type: "blob" | "tree"; size?: number; sha: string } =>
          e.type === "blob" || e.type === "tree",
      )
      .map((e) => ({
        path: e.path,
        type: e.type,
        size: e.size ?? 0,
        sha: e.sha,
      })),
    fetchedAt: new Date().toISOString(),
  };
  await ctx.refs.putTree(record);
  return record;
}

function isFresh(iso: string, maxAgeMs: number): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < maxAgeMs;
}
