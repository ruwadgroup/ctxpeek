// GitHub repository search — last-resort resolver step.
import type { GithubRestClient } from "../fetch/githubRest.js";

export type SearchHit = {
  readonly owner: string;
  readonly repo: string;
  readonly stars: number;
  readonly description: string | null;
  readonly defaultBranch: string;
};

export async function searchGithub(
  client: GithubRestClient,
  query: string,
  perPage = 5,
): Promise<ReadonlyArray<SearchHit>> {
  return client.searchRepositories(query, perPage);
}
