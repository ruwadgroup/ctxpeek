/**
 * The behavioural contract every forge plug-in implements. Moved out of
 * `forge.ts` so plug-ins import only the interface, not the built-in
 * implementations.
 */
import type { CommitInfo, ContentsResult, IssueHit, RepoMetadata, TreeApiResult } from "./githubRest.js";

export type ForgeClient = {
  readonly forge: string;
  hasToken(): boolean;
  getRepo(owner: string, repo: string): Promise<RepoMetadata>;
  resolveRef(owner: string, repo: string, ref: string): Promise<CommitInfo>;
  getTree(owner: string, repo: string, sha: string, recursive?: boolean): Promise<TreeApiResult>;
  getContents(
    owner: string,
    repo: string,
    filePath: string,
    ref: string,
    etag?: string,
  ): Promise<ContentsResult>;
  getLastCommitForPath(
    owner: string,
    repo: string,
    ref: string,
    filePath: string,
  ): Promise<CommitInfo | null>;
  searchRepositories(
    query: string,
    perPage?: number,
  ): Promise<
    ReadonlyArray<{
      owner: string;
      repo: string;
      stars: number;
      description: string | null;
      defaultBranch: string;
    }>
  >;
  searchIssues?(
    owner: string,
    repo: string,
    query: string,
    opts?: {
      state?: "open" | "closed" | "all";
      perPage?: number;
      type?: "issue" | "pr" | "both";
    },
  ): Promise<ReadonlyArray<IssueHit>>;
  /** URL builder for the raw-CDN equivalent: jsDelivr `/gh/` for GitHub, `/gl/` for GitLab, null for forges without a CDN. */
  cdnUrl(owner: string, repo: string, commitSha: string, path: string): string | null;
};

export type ForgeRegistry = Record<string, ForgeClient>;

export function pickForge(forges: ForgeRegistry, id: string): ForgeClient {
  const client = forges[id];
  if (!client) {
    throw new Error(`forge "${id}" is not registered (known: ${Object.keys(forges).sort().join(", ")})`);
  }
  return client;
}
