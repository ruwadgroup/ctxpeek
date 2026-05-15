// GitHub REST client. Uses undici via HttpClient for connection pooling.

import { NotFoundError, RateLimitError } from "@docpilot/core";
import type { RepoMetaCache } from "../cache/repoMeta.js";
import { HttpClient, type HttpRequestInit, type HttpResponse } from "../util/index.js";
import type { RateLimiter } from "./ratelimit.js";

export type RestClientOptions = {
  readonly token: string | undefined;
  readonly userAgent: string;
  readonly baseUrl?: string;
  readonly limiter?: RateLimiter;
  readonly http?: HttpClient;
  readonly repoMeta?: RepoMetaCache;
};

export type RepoMetadata = {
  readonly owner: string;
  readonly repo: string;
  readonly defaultBranch: string;
  readonly stars: number;
  readonly description: string | null;
  readonly latestTag: string | null;
};

export type CommitInfo = {
  readonly sha: string;
  readonly committedAt: string;
};

export type TreeApiEntry = {
  readonly path: string;
  readonly type: "blob" | "tree" | "commit";
  readonly size?: number;
  readonly sha: string;
};

export type TreeApiResult = {
  readonly sha: string;
  readonly truncated: boolean;
  readonly tree: ReadonlyArray<TreeApiEntry>;
};

export type ContentsResult = {
  readonly status: 200 | 304 | 404;
  readonly etag: string | undefined;
  readonly bytes: Uint8Array | undefined;
  readonly base64?: boolean;
};

export type IssueHit = {
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly isPullRequest: boolean;
  readonly url: string;
  readonly updatedAt: string;
  readonly author: string;
  readonly bodyPreview: string;
};

export class GithubRestClient {
  private readonly http: HttpClient;
  private readonly token: string | undefined;
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter | undefined;
  private readonly repoMeta: RepoMetaCache | undefined;

  constructor(opts: RestClientOptions) {
    this.http = opts.http ?? new HttpClient(opts.userAgent ? { userAgent: opts.userAgent } : {});
    this.token = opts.token;
    this.baseUrl = opts.baseUrl ?? "https://api.github.com";
    this.limiter = opts.limiter;
    this.repoMeta = opts.repoMeta;
  }

  hasToken(): boolean {
    return Boolean(this.token);
  }

  /**
   * Repo metadata. Hits the 7-day cache first, dedupes concurrent calls.
   * `latestTag` is fetched lazily — see `getLatestTag` — so the resolve hot
   * path doesn't burn a second REST call for an enrichment field most
   * callers don't read.
   */
  async getRepo(owner: string, repo: string): Promise<RepoMetadata> {
    if (this.repoMeta) {
      const cached = await this.repoMeta.get("github", owner, repo);
      if (cached) {
        return {
          owner: cached.owner,
          repo: cached.repo,
          defaultBranch: cached.defaultBranch,
          stars: cached.stars,
          description: cached.description,
          latestTag: cached.latestTag,
        };
      }
      if (this.repoMeta.isKnownMissing("github", owner, repo)) {
        throw new NotFoundError(`${owner}/${repo}`);
      }
    }
    return this.dedup(`getRepo:${owner}/${repo}`, async () => {
      try {
        const res = await this.request(`${this.baseUrl}/repos/${owner}/${repo}`);
        this.assertSuccess(res, `${owner}/${repo}`);
        const data = JSON.parse(res.body.toString("utf8")) as {
          full_name: string;
          default_branch: string;
          stargazers_count: number;
          description: string | null;
        };
        const meta: RepoMetadata = {
          owner,
          repo,
          defaultBranch: data.default_branch,
          stars: data.stargazers_count,
          description: data.description,
          latestTag: null,
        };
        if (this.repoMeta) {
          await this.repoMeta.put({
            forge: "github",
            owner: meta.owner,
            repo: meta.repo,
            defaultBranch: meta.defaultBranch,
            stars: meta.stars,
            description: meta.description,
            latestTag: null,
            latestTagFetchedAt: null,
            fetchedAt: new Date().toISOString(),
          });
        }
        return meta;
      } catch (err) {
        if (err instanceof NotFoundError && this.repoMeta) {
          this.repoMeta.markMissing("github", owner, repo);
        }
        throw err;
      }
    });
  }

  /**
   * Cached latest-release tag with a 1-day TTL. Only the first caller per
   * day per repo spends an API call.
   */
  async getLatestTag(owner: string, repo: string): Promise<string | null> {
    if (this.repoMeta) {
      const cached = await this.repoMeta.getLatestTag("github", owner, repo);
      if (cached !== undefined) return cached;
    }
    return this.dedup(`getLatestTag:${owner}/${repo}`, async () => {
      const tag = await this.tryGetLatestTag(owner, repo);
      if (this.repoMeta) {
        await this.repoMeta.putLatestTag("github", owner, repo, tag);
      }
      return tag;
    });
  }

  async tryGetLatestTag(owner: string, repo: string): Promise<string | null> {
    try {
      const res = await this.request(`${this.baseUrl}/repos/${owner}/${repo}/releases/latest`);
      if (res.status === 404) return null;
      if (res.status !== 200) return null;
      const data = JSON.parse(res.body.toString("utf8")) as {
        tag_name?: string;
      };
      return data.tag_name ?? null;
    } catch {
      return null;
    }
  }

  async resolveRef(owner: string, repo: string, ref: string): Promise<CommitInfo> {
    if (this.repoMeta?.isKnownMissing("github", owner, repo, ref)) {
      throw new NotFoundError(`${owner}/${repo}@${ref}`);
    }
    return this.dedup(`resolveRef:${owner}/${repo}@${ref}`, async () => {
      try {
        const res = await this.request(
          `${this.baseUrl}/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
        );
        this.assertSuccess(res, `${owner}/${repo}@${ref}`);
        const data = JSON.parse(res.body.toString("utf8")) as {
          sha: string;
          commit: { committer: { date: string } };
        };
        return { sha: data.sha, committedAt: data.commit.committer.date };
      } catch (err) {
        if (err instanceof NotFoundError && this.repoMeta) {
          this.repoMeta.markMissing("github", owner, repo, ref);
        }
        throw err;
      }
    });
  }

  private dedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (!this.repoMeta) return fn();
    return this.repoMeta.dedup(key, fn);
  }

  async getTree(owner: string, repo: string, sha: string, recursive = true): Promise<TreeApiResult> {
    return this.dedup(`getTree:${owner}/${repo}@${sha}:${recursive ? "r" : "f"}`, async () => {
      const url = `${this.baseUrl}/repos/${owner}/${repo}/git/trees/${sha}${recursive ? "?recursive=1" : ""}`;
      const res = await this.request(url);
      this.assertSuccess(res, `${owner}/${repo}@${sha}/tree`);
      const data = JSON.parse(res.body.toString("utf8")) as {
        sha: string;
        truncated: boolean;
        tree: Array<{ path: string; type: string; size?: number; sha: string }>;
      };
      return {
        sha: data.sha,
        truncated: data.truncated,
        tree: data.tree
          .filter((e) => e.type === "blob" || e.type === "tree" || e.type === "commit")
          .map((e) => {
            const entry: {
              path: string;
              type: "blob" | "tree" | "commit";
              sha: string;
              size?: number;
            } = {
              path: e.path,
              type: e.type as "blob" | "tree" | "commit",
              sha: e.sha,
            };
            if (e.size !== undefined) entry.size = e.size;
            return entry as TreeApiEntry;
          }),
      };
    });
  }

  async getContents(
    owner: string,
    repo: string,
    filePath: string,
    ref: string,
    etag?: string,
  ): Promise<ContentsResult> {
    const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${encodePath(filePath)}?ref=${encodeURIComponent(ref)}`;
    const init: HttpRequestInit = {
      headers: {
        ...this.authHeader(),
        accept: "application/vnd.github.raw+json",
        ...(etag ? { "if-none-match": etag } : {}),
      },
    };
    const res = await this.executeWithLimiter(url, init);
    if (res.status === 304) {
      return { status: 304, etag: res.headers.etag, bytes: undefined };
    }
    if (res.status === 404) return { status: 404, etag: undefined, bytes: undefined };
    if (res.status === 200) {
      return {
        status: 200,
        etag: res.headers.etag,
        bytes: new Uint8Array(res.body),
      };
    }
    this.assertSuccess(res, `${owner}/${repo}/${filePath}@${ref}`);
    throw new Error(`unexpected status ${res.status}`);
  }

  /**
   * Larger files: GitHub's contents API caps at 1 MB raw. Fall back to the
   * git blob API which returns base64 and accepts much larger blobs.
   */
  async getBlobBySha(owner: string, repo: string, blobSha: string): Promise<Uint8Array> {
    const res = await this.request(`${this.baseUrl}/repos/${owner}/${repo}/git/blobs/${blobSha}`);
    this.assertSuccess(res, `${owner}/${repo}/blob/${blobSha}`);
    const data = JSON.parse(res.body.toString("utf8")) as {
      content: string;
      encoding: string;
    };
    if (data.encoding === "base64") {
      return new Uint8Array(Buffer.from(data.content, "base64"));
    }
    return new Uint8Array(Buffer.from(data.content, "utf8"));
  }

  async getLastCommitForPath(
    owner: string,
    repo: string,
    ref: string,
    filePath: string,
  ): Promise<CommitInfo | null> {
    const url = `${this.baseUrl}/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(ref)}&path=${encodePath(filePath)}&per_page=1`;
    const res = await this.request(url);
    if (res.status === 404) return null;
    if (res.status !== 200) return null;
    const arr = JSON.parse(res.body.toString("utf8")) as Array<{
      sha: string;
      commit: { committer: { date: string } };
    }>;
    if (arr.length === 0) return null;
    const first = arr[0];
    if (!first) return null;
    return { sha: first.sha, committedAt: first.commit.committer.date };
  }

  async searchRepositories(
    query: string,
    perPage = 5,
  ): Promise<
    ReadonlyArray<{
      owner: string;
      repo: string;
      stars: number;
      description: string | null;
      defaultBranch: string;
    }>
  > {
    const q = encodeURIComponent(`${query} in:name`);
    const url = `${this.baseUrl}/search/repositories?q=${q}&sort=stars&per_page=${perPage}`;
    const res = await this.request(url);
    if (res.status === 403 || res.status === 429) {
      throw new RateLimitError("GitHub search rate limit reached");
    }
    if (res.status !== 200) return [];
    const data = JSON.parse(res.body.toString("utf8")) as {
      items: Array<{
        full_name: string;
        stargazers_count: number;
        description: string | null;
        default_branch: string;
      }>;
    };
    return data.items.map((item) => {
      const [owner, repo] = item.full_name.split("/");
      return {
        owner: owner ?? "",
        repo: repo ?? "",
        stars: item.stargazers_count,
        description: item.description,
        defaultBranch: item.default_branch,
      };
    });
  }

  async searchIssues(
    owner: string,
    repo: string,
    query: string,
    opts: {
      state?: "open" | "closed" | "all";
      perPage?: number;
      type?: "issue" | "pr" | "both";
    } = {},
  ): Promise<ReadonlyArray<IssueHit>> {
    const stateClause = opts.state && opts.state !== "all" ? ` state:${opts.state}` : "";
    const typeClause = opts.type === "issue" ? " type:issue" : opts.type === "pr" ? " type:pr" : "";
    const q = encodeURIComponent(`repo:${owner}/${repo}${stateClause}${typeClause} ${query}`);
    const url = `${this.baseUrl}/search/issues?q=${q}&per_page=${opts.perPage ?? 5}&sort=updated&order=desc`;
    const res = await this.request(url);
    if (res.status === 403 || res.status === 429) {
      throw new RateLimitError("GitHub search rate limit reached");
    }
    if (res.status !== 200) return [];
    const data = JSON.parse(res.body.toString("utf8")) as {
      items: Array<{
        number: number;
        title: string;
        state: string;
        pull_request?: object;
        html_url: string;
        updated_at: string;
        user: { login: string };
        body: string | null;
      }>;
    };
    return data.items.map((item) => ({
      number: item.number,
      title: item.title,
      state: item.state,
      isPullRequest: Boolean(item.pull_request),
      url: item.html_url,
      updatedAt: item.updated_at,
      author: item.user.login,
      bodyPreview: (item.body ?? "").slice(0, 280),
    }));
  }

  private async request(url: string, init: HttpRequestInit = {}): Promise<HttpResponse> {
    return this.executeWithLimiter(url, {
      ...init,
      headers: { ...this.authHeader(), ...init.headers },
    });
  }

  private async executeWithLimiter(url: string, init: HttpRequestInit): Promise<HttpResponse> {
    if (this.limiter) await this.limiter.acquire();
    try {
      const res = await this.http.fetch(url, init);
      if (this.limiter) this.limiter.observe(res.headers);
      if (res.status === 403 && /rate limit/i.test(res.body.toString("utf8"))) {
        const reset = res.headers["x-ratelimit-reset"];
        throw new RateLimitError("GitHub rate limit hit", reset ? new Date(Number(reset) * 1000) : undefined);
      }
      return res;
    } finally {
      if (this.limiter) this.limiter.release();
    }
  }

  private authHeader(): Record<string, string> {
    const out: Record<string, string> = {
      "x-github-api-version": "2022-11-28",
      accept: "application/vnd.github+json",
    };
    if (this.token) out.authorization = `Bearer ${this.token}`;
    return out;
  }

  private assertSuccess(res: HttpResponse, what: string): void {
    if (res.status === 404) throw new NotFoundError(what);
    if (res.status === 403 || res.status === 429) {
      const reset = res.headers["x-ratelimit-reset"];
      throw new RateLimitError(
        `GitHub rejected request for ${what}`,
        reset ? new Date(Number(reset) * 1000) : undefined,
      );
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(
        `GitHub responded ${res.status} for ${what}: ${res.body.toString("utf8").slice(0, 200)}`,
      );
    }
  }
}

function encodePath(p: string): string {
  return p
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
}
