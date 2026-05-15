/**
 * Bitbucket Cloud forge plug-in. Hits api.bitbucket.org/2.0 directly. Has
 * no jsDelivr equivalent, so CDN reads fall back to authenticated REST.
 */
import { NotFoundError, RateLimitError } from "../../core/index.js";
import type { ForgeBootContext } from "../defineForge.js";
import { defineForge } from "../defineForge.js";
import type { ForgeClient } from "../forgeClient.js";

type BitbucketResponse<T> = {
  readonly status: number;
  readonly data: T | null;
  readonly etag: string | undefined;
  readonly body: Buffer;
};

export default defineForge({
  id: "bitbucket",
  displayName: "Bitbucket",
  aliases: ["bb"],
  tokenEnv: "BITBUCKET_TOKEN",
  create: (ctx) => buildClient(ctx),
});

function buildClient(ctx: ForgeBootContext): ForgeClient {
  const headers = (): Record<string, string> => {
    const out: Record<string, string> = { accept: "application/json" };
    if (ctx.token) out.authorization = `Bearer ${ctx.token}`;
    return out;
  };

  async function request<T>(url: string, etag?: string): Promise<BitbucketResponse<T>> {
    await ctx.limiter.acquire();
    try {
      const h = headers();
      if (etag) h["if-none-match"] = etag;
      const res = await ctx.http.fetch(url, { headers: h });
      ctx.limiter.observe(res.headers);
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        throw new RateLimitError(`Bitbucket rejected ${url}`);
      }
      if (res.status === 304)
        return {
          status: 304,
          data: null,
          etag: res.headers.etag,
          body: res.body,
        };
      if (res.status === 404) return { status: 404, data: null, etag: undefined, body: res.body };
      try {
        return {
          status: res.status,
          data: JSON.parse(res.body.toString("utf8")) as T,
          etag: res.headers.etag,
          body: res.body,
        };
      } catch {
        return {
          status: res.status,
          data: null,
          etag: res.headers.etag,
          body: res.body,
        };
      }
    } finally {
      ctx.limiter.release();
    }
  }

  return {
    forge: "bitbucket",
    hasToken: () => Boolean(ctx.token),

    async getRepo(owner, repo) {
      const r = await request<{
        mainbranch?: { name: string };
        description?: string;
      }>(`https://api.bitbucket.org/2.0/repositories/${owner}/${repo}`);
      if (!r.data) throw new NotFoundError(`${owner}/${repo}`);
      return {
        owner,
        repo,
        defaultBranch: r.data.mainbranch?.name ?? "main",
        stars: 0,
        description: r.data.description ?? null,
        latestTag: null,
      };
    },

    async resolveRef(owner, repo, ref) {
      const r = await request<{ hash: string; date: string }>(
        `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/commit/${encodeURIComponent(ref)}`,
      );
      if (r.data) return { sha: r.data.hash, committedAt: r.data.date };
      const branch = await request<{
        target?: { hash?: string; date?: string };
      }>(
        `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/refs/branches/${encodeURIComponent(ref)}`,
      );
      const target = branch.data?.target;
      if (!target?.hash) throw new NotFoundError(`${owner}/${repo}@${ref}`);
      return {
        sha: target.hash,
        committedAt: target.date ?? new Date().toISOString(),
      };
    },

    async getTree(owner, repo, sha) {
      const entries: {
        path: string;
        type: "blob" | "tree";
        sha: string;
        size: number;
      }[] = [];
      const seen = new Set<string>();
      let nextUrl: string | null =
        `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/src/${sha}/?pagelen=100`;
      type Page = {
        values?: Array<{ path: string; type: string; size?: number }>;
        next?: string;
      };
      while (nextUrl && entries.length < 5000) {
        const page: BitbucketResponse<Page> = await request<Page>(nextUrl);
        if (!page.data) break;
        for (const v of page.data.values ?? []) {
          if (seen.has(v.path)) continue;
          seen.add(v.path);
          entries.push({
            path: v.path,
            type: v.type === "commit_directory" ? "tree" : "blob",
            sha: "",
            size: v.size ?? 0,
          });
        }
        nextUrl = page.data.next ?? null;
      }
      return { sha, truncated: entries.length >= 5000, tree: entries };
    },

    async getContents(owner, repo, filePath, ref, etag) {
      const url = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/src/${encodeURIComponent(ref)}/${encodeURIComponent(filePath)}`;
      const r = await request<never>(url, etag);
      if (r.status === 304) return { status: 304, etag: r.etag, bytes: undefined };
      if (r.status === 404) return { status: 404, etag: undefined, bytes: undefined };
      return { status: 200, etag: r.etag, bytes: new Uint8Array(r.body) };
    },

    async getLastCommitForPath(owner, repo, ref, filePath) {
      const url = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/commits/${encodeURIComponent(ref)}?path=${encodeURIComponent(filePath)}&pagelen=1`;
      const r = await request<{
        values?: Array<{ hash: string; date: string }>;
      }>(url);
      const first = r.data?.values?.[0];
      if (!first) return null;
      return { sha: first.hash, committedAt: first.date };
    },

    async searchRepositories() {
      // Bitbucket Cloud has no public repo-search endpoint comparable to
      // GitHub's; resolver degrades gracefully by returning [].
      return [];
    },

    cdnUrl: () => null,
  };
}
