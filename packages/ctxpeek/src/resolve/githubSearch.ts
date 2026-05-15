// GitHub repository search — last-resort resolver step.
//
// Prefers GraphQL when an authed client is available: REST /search/* lives on
// the 30-req/min bucket, while GraphQL search counts against the 5000pt/hr
// GraphQL budget. Falls back to REST if GraphQL fails for any reason.
import type { GithubGraphqlClient } from "../fetch/githubGraphql.js";
import type { GithubRestClient } from "../fetch/githubRest.js";

export type SearchHit = {
  readonly owner: string;
  readonly repo: string;
  readonly stars: number;
  readonly description: string | null;
  readonly defaultBranch: string;
};

export async function searchGithub(
  rest: GithubRestClient,
  graphql: GithubGraphqlClient | null,
  query: string,
  perPage = 5,
): Promise<ReadonlyArray<SearchHit>> {
  if (graphql) {
    try {
      const hits = await graphql.searchRepositories(query, perPage);
      if (hits.length > 0) return hits;
    } catch {
      // fall through to REST
    }
  }
  return rest.searchRepositories(query, perPage);
}
