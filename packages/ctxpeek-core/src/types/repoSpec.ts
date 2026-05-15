/**
 * Hosted git forges ctxpeek speaks to. `github` is the v0.1 default and
 * keeps every URL/Auth path the same. `gitlab` / `bitbucket` arrived in
 * v0.4 (see design doc §15 non-goals — they were explicitly deferred).
 */
export type Forge = "github" | "gitlab" | "bitbucket";

/**
 * Parsed form of `[forge:]owner/repo[@ref][#subpath]`.
 *
 * The string form is the canonical input across every ctxpeek tool. See
 * §5 of the design doc for the full grammar. The optional `forge:` prefix
 * (e.g. `gitlab:gitlab-org/gitlab`) is the v0.4 extension; bare strings
 * still default to GitHub.
 */
export type RepoSpec = {
  readonly forge: Forge;
  readonly owner: string;
  readonly repo: string;
  readonly ref: string | undefined;
  readonly subpath: string | undefined;
};

/**
 * The raw input string a user (or model) typed.
 * Branded for clarity — pass through `parseRepoSpec` before use.
 */
export type RepoSpecString = string & { readonly__brand: "RepoSpecString" };
