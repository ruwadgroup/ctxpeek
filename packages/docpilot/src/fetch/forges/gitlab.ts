/**
 * GitLab forge plug-in. Talks directly to gitlab.com REST v4 and uses
 * jsDelivr's `/gl/` namespace for CDN reads.
 */
import { NotFoundError, RateLimitError } from "@docpilot/core";
import type { ForgeBootContext } from "../defineForge.js";
import { defineForge } from "../defineForge.js";
import type { ForgeClient } from "../forgeClient.js";

type GitlabResponse<T> = {
  readonly status: number;
  readonly data: T | null;
  readonly etag: string | undefined;
  readonly body: Buffer;
};

export default defineForge({
  id: "gitlab",
  displayName: "GitLab",
  aliases: ["gl"],
  tokenEnv: "GITLAB_TOKEN",
  create: (ctx) => buildClient(ctx),
});

function buildClient(ctx: ForgeBootContext): ForgeClient {
  const headers = (): Record<string, string> => {
    const out: Record<string, string> = { accept: "application/json" };
    if (ctx.token) out["private-token"] = ctx.token;
    return out;
  };

  async function request<T>(url: string, etag?: string): Promise<GitlabResponse<T>> {
    await ctx.limiter.acquire();
    try {
      const h = headers();
      if (etag) h["if-none-match"] = etag;
      const res = await ctx.http.fetch(url, { headers: h });
      ctx.limiter.observe(res.headers);
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        throw new RateLimitError(`GitLab rejected ${url}`);
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

  const projectId = (owner: string, repo: string) => encodeURIComponent(`${owner}/${repo}`);

  return {
    forge: "gitlab",
    hasToken: () => Boolean(ctx.token),

    async getRepo(owner, repo) {
      const r = await request<{
        default_branch: string;
        star_count: number;
        description: string | null;
      }>(`https://gitlab.com/api/v4/projects/${projectId(owner, repo)}`);
      if (!r.data) throw new NotFoundError(`${owner}/${repo}`);
      return {
        owner,
        repo,
        defaultBranch: r.data.default_branch,
        stars: r.data.star_count,
        description: r.data.description,
        latestTag: null,
      };
    },

    async resolveRef(owner, repo, ref) {
      const r = await request<{ id: string; committed_date: string }>(
        `https://gitlab.com/api/v4/projects/${projectId(owner, repo)}/repository/commits/${encodeURIComponent(ref)}`,
      );
      if (!r.data) throw new NotFoundError(`${owner}/${repo}@${ref}`);
      return { sha: r.data.id, committedAt: r.data.committed_date };
    },

    async getTree(owner, repo, sha) {
      const r = await request<
        Array<{
          path: string;
          type: "blob" | "tree";
          id: string;
        }>
      >(
        `https://gitlab.com/api/v4/projects/${projectId(owner, repo)}/repository/tree?ref=${encodeURIComponent(sha)}&recursive=true&per_page=100`,
      );
      if (!r.data) throw new NotFoundError(`${owner}/${repo}@${sha}/tree`);
      return {
        sha,
        truncated: r.data.length >= 100,
        tree: r.data.map((e) => ({
          path: e.path,
          type: e.type,
          sha: e.id,
          size: 0,
        })),
      };
    },

    async getContents(owner, repo, filePath, ref, etag) {
      const url = `https://gitlab.com/api/v4/projects/${projectId(owner, repo)}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${encodeURIComponent(ref)}`;
      const r = await request<never>(url, etag);
      if (r.status === 304) return { status: 304, etag: r.etag, bytes: undefined };
      if (r.status === 404) return { status: 404, etag: undefined, bytes: undefined };
      return { status: 200, etag: r.etag, bytes: new Uint8Array(r.body) };
    },

    async getLastCommitForPath(owner, repo, ref, filePath) {
      const url = `https://gitlab.com/api/v4/projects/${projectId(owner, repo)}/repository/commits?ref_name=${encodeURIComponent(ref)}&path=${encodeURIComponent(filePath)}&per_page=1`;
      const r = await request<Array<{ id: string; committed_date: string }>>(url);
      const first = r.data?.[0];
      if (!first) return null;
      return { sha: first.id, committedAt: first.committed_date };
    },

    async searchRepositories(query, perPage = 5) {
      const r = await request<
        Array<{
          path_with_namespace: string;
          star_count: number;
          description: string | null;
          default_branch: string;
        }>
      >(
        `https://gitlab.com/api/v4/projects?search=${encodeURIComponent(query)}&per_page=${perPage}&order_by=star_count&sort=desc`,
      );
      if (!r.data) return [];
      return r.data.map((p) => {
        const [owner, name] = p.path_with_namespace.split("/");
        return {
          owner: owner ?? "",
          repo: name ?? "",
          stars: p.star_count,
          description: p.description,
          defaultBranch: p.default_branch,
        };
      });
    },

    cdnUrl: (o, r, sha, p) => `https://cdn.jsdelivr.net/gl/${o}/${r}@${sha}/${p.replace(/^\/+/, "")}`,
  };
}
