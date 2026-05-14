/**
 * GitHub GraphQL client.
 *
 * Used for alias-batched blob fetches when ≥4 files are needed cold. GraphQL
 * has no ETag support, so this is the wrong tool for repeated fetches; on a
 * fresh batch it costs ~1–3 points vs N REST requests.
 *
 * Design doc §4.2 step 4.
 */

import { RateLimitError } from "@docpilot/core";
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
