/**
 * GitHub GraphQL client.
 *
 * Used for alias-batched blob fetches when ≥4 files are needed cold. GraphQL
 * has no ETag support, so this is the wrong tool for repeated fetches; on a
 * fresh batch it costs ~1–3 points vs N REST requests.
 *
 * Design doc §4.2 step 4.
 */

import { RateLimitError } from "../core/index.js";
import { HttpClient } from "../util/index.js";
import type { RateLimiter } from "./ratelimit.js";

export type GraphqlClientOptions = {
  readonly token: string;
  readonly userAgent?: string;
  readonly endpoint?: string;
  readonly limiter?: RateLimiter;
  readonly http?: HttpClient;
};

export type BatchedBlob = {
  readonly path: string;
  readonly text: string | null;
};

export type GraphqlRepoHit = {
  readonly owner: string;
  readonly repo: string;
  readonly stars: number;
  readonly description: string | null;
  readonly defaultBranch: string;
};

export type GraphqlIssueHit = {
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly isPullRequest: boolean;
  readonly url: string;
  readonly updatedAt: string;
  readonly author: string;
  readonly bodyPreview: string;
};

export type GraphqlRepoMetadata = {
  readonly owner: string;
  readonly repo: string;
  readonly defaultBranch: string;
  readonly stars: number;
  readonly description: string | null;
  readonly latestTag: string | null;
};

export class GithubGraphqlClient {
  private readonly http: HttpClient;
  private readonly token: string;
  private readonly endpoint: string;
  private readonly limiter: RateLimiter | undefined;

  constructor(opts: GraphqlClientOptions) {
    this.http = opts.http ?? new HttpClient(opts.userAgent ? { userAgent: opts.userAgent } : {});
    this.token = opts.token;
    this.endpoint = opts.endpoint ?? "https://api.github.com/graphql";
    this.limiter = opts.limiter;
  }

  /**
   * Repo search via GraphQL. Counts against the 5000pt/hr GraphQL budget
   * instead of the brutal 30-req/min REST /search/* bucket — same answers,
   * much more headroom.
   */
  async searchRepositories(query: string, perPage = 5): Promise<ReadonlyArray<GraphqlRepoHit>> {
    const q = `${query} in:name`;
    const gql = `query DocRepoSearch($q: String!, $first: Int!) {
      search(type: REPOSITORY, query: $q, first: $first) {
        nodes {
          ... on Repository {
            owner { login }
            name
            stargazerCount
            description
            defaultBranchRef { name }
          }
        }
      }
    }`;
    const data = await this.exec<{
      search: {
        nodes: Array<{
          owner: { login: string };
          name: string;
          stargazerCount: number;
          description: string | null;
          defaultBranchRef: { name: string } | null;
        }>;
      };
    }>(gql, { q, first: perPage });
    return data.search.nodes
      .filter((n) => n.owner && n.name)
      .map((n) => ({
        owner: n.owner.login,
        repo: n.name,
        stars: n.stargazerCount,
        description: n.description,
        defaultBranch: n.defaultBranchRef?.name ?? "main",
      }));
  }

  /**
   * Issue/PR search via GraphQL. Same rationale as searchRepositories.
   */
  async searchIssues(
    owner: string,
    repo: string,
    query: string,
    opts: {
      state?: "open" | "closed" | "all";
      perPage?: number;
      type?: "issue" | "pr" | "both";
    } = {},
  ): Promise<ReadonlyArray<GraphqlIssueHit>> {
    const stateClause = opts.state && opts.state !== "all" ? ` state:${opts.state}` : "";
    const typeClause = opts.type === "issue" ? " type:issue" : opts.type === "pr" ? " type:pr" : "";
    const q = `repo:${owner}/${repo}${stateClause}${typeClause} ${query} sort:updated-desc`;
    const gql = `query DocIssueSearch($q: String!, $first: Int!) {
      search(type: ISSUE, query: $q, first: $first) {
        nodes {
          ... on Issue {
            number title state url updatedAt
            author { login }
            body
          }
          ... on PullRequest {
            number title state url updatedAt
            author { login }
            body
          }
        }
      }
    }`;
    const data = await this.exec<{
      search: {
        nodes: Array<
          | {
              number: number;
              title: string;
              state: string;
              url: string;
              updatedAt: string;
              author: { login: string } | null;
              body: string | null;
              // We can't query __typename on inline fragments cleanly without
              // bumping schema; rely on `state` + URL shape to discriminate
              // PR vs issue at the GraphQL side — see post-processing below.
            }
          | Record<string, never>
        >;
      };
    }>(gql, { q, first: opts.perPage ?? 5 });
    return data.search.nodes
      .filter((n): n is Exclude<typeof n, Record<string, never>> => "number" in n)
      .map((n) => ({
        number: n.number,
        title: n.title,
        state: n.state,
        // GitHub PR URLs look like /pull/N, issue URLs like /issues/N.
        isPullRequest: /\/pull\/\d+/.test(n.url),
        url: n.url,
        updatedAt: n.updatedAt,
        author: n.author?.login ?? "",
        bodyPreview: (n.body ?? "").slice(0, 280),
      }));
  }

  /**
   * Batch metadata for many (owner, repo) pairs in a single GraphQL call
   * via aliased subqueries. Returns a parallel array; a null slot means the
   * repo was missing or the alias failed.
   */
  async batchGetRepoMetadata(
    pairs: ReadonlyArray<{ owner: string; repo: string }>,
  ): Promise<ReadonlyArray<GraphqlRepoMetadata | null>> {
    if (pairs.length === 0) return [];
    const aliases = pairs.map((_, i) => `r${i}`);
    const vars: Record<string, string> = {};
    const fields = aliases
      .map((alias, i) => {
        const owner = pairs[i]?.owner ?? "";
        const repo = pairs[i]?.repo ?? "";
        const ownerVar = `o${i}`;
        const nameVar = `n${i}`;
        vars[ownerVar] = owner;
        vars[nameVar] = repo;
        return `${alias}: repository(owner: $${ownerVar}, name: $${nameVar}) {
          stargazerCount
          description
          defaultBranchRef { name }
          latestRelease { tagName }
        }`;
      })
      .join("\n");
    const argList = aliases.map((_, i) => `$o${i}: String!, $n${i}: String!`).join(", ");
    const gql = `query DocBatchRepoMeta(${argList}) {\n${fields}\n}`;
    try {
      const data = await this.exec<
        Record<
          string,
          {
            stargazerCount: number;
            description: string | null;
            defaultBranchRef: { name: string } | null;
            latestRelease: { tagName: string } | null;
          } | null
        >
      >(gql, vars);
      return aliases.map((alias, i) => {
        const node = data[alias];
        const pair = pairs[i];
        if (!node || !pair) return null;
        return {
          owner: pair.owner,
          repo: pair.repo,
          defaultBranch: node.defaultBranchRef?.name ?? "main",
          stars: node.stargazerCount,
          description: node.description,
          latestTag: node.latestRelease?.tagName ?? null,
        };
      });
    } catch {
      return aliases.map(() => null);
    }
  }

  /**
   * Repo metadata in one shot — defaultBranch, stars, description, and the
   * latest release tag. Replaces three REST calls (getRepo + resolveRef on
   * the default branch + releases/latest) with one GraphQL roundtrip.
   */
  async getRepoMetadata(owner: string, repo: string): Promise<GraphqlRepoMetadata | null> {
    const gql = `query DocRepoMeta($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        stargazerCount
        description
        defaultBranchRef { name }
        latestRelease { tagName }
      }
    }`;
    try {
      const data = await this.exec<{
        repository: {
          stargazerCount: number;
          description: string | null;
          defaultBranchRef: { name: string } | null;
          latestRelease: { tagName: string } | null;
        } | null;
      }>(gql, { owner, name: repo });
      if (!data.repository) return null;
      return {
        owner,
        repo,
        defaultBranch: data.repository.defaultBranchRef?.name ?? "main",
        stars: data.repository.stargazerCount,
        description: data.repository.description,
        latestTag: data.repository.latestRelease?.tagName ?? null,
      };
    } catch {
      return null;
    }
  }

  /** Low-level GraphQL request runner. */
  private async exec<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    if (this.limiter) await this.limiter.acquire();
    try {
      const res = await this.http.fetch(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status === 401 || res.status === 403) throw new RateLimitError("GraphQL rejected request");
      if (res.status !== 200)
        throw new Error(`GraphQL HTTP ${res.status}: ${res.body.toString("utf8").slice(0, 200)}`);
      const json = JSON.parse(res.body.toString("utf8")) as {
        data?: T;
        errors?: Array<{ message: string }>;
      };
      if (json.errors && json.errors.length > 0) {
        throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);
      }
      if (!json.data) throw new Error("GraphQL response missing data");
      return json.data;
    } finally {
      if (this.limiter) this.limiter.release();
    }
  }

  async batchBlobs(
    owner: string,
    repo: string,
    commitSha: string,
    paths: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<BatchedBlob>> {
    if (paths.length === 0) return [];
    const aliases = paths.map((_, i) => `f${i}`);
    const fields = aliases
      .map(
        (alias, i) =>
          `${alias}: object(expression: "${commitSha}:${paths[i]}") { ... on Blob { text byteSize isBinary } }`,
      )
      .join("\n");
    const query = `query DocBatch($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        ${fields}
      }
      rateLimit { remaining cost resetAt }
    }`;
    if (this.limiter) await this.limiter.acquire();
    try {
      const res = await this.http.fetch(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query, variables: { owner, name: repo } }),
      });
      if (res.status === 401 || res.status === 403) throw new RateLimitError("GraphQL rejected request");
      if (res.status !== 200)
        throw new Error(`GraphQL HTTP ${res.status}: ${res.body.toString("utf8").slice(0, 200)}`);
      const json = JSON.parse(res.body.toString("utf8")) as {
        data?: { repository?: Record<string, { text: string | null } | null> };
        errors?: Array<{ message: string }>;
      };
      if (json.errors && json.errors.length > 0) {
        throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);
      }
      const repoData = json.data?.repository ?? {};
      return aliases.map((alias, i) => ({
        path: paths[i] ?? "",
        text: repoData[alias]?.text ?? null,
      }));
    } finally {
      if (this.limiter) this.limiter.release();
    }
  }
}
