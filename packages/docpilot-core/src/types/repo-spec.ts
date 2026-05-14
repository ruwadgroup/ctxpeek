/**
 * Parsed form of `owner/repo[@ref][#subpath]`.
 *
 * The string form is the canonical input across every docpilot tool. See
 * §5 of the design doc for the full grammar.
 */
export interface RepoSpec {
  readonly owner: string;
  readonly repo: string;
  readonly ref: string | undefined;
  readonly subpath: string | undefined;
}

/**
 * The raw input string a user (or model) typed.
 * Branded for clarity — pass through `parseRepoSpec` before use.
 */
export type RepoSpecString = string & { readonly __brand: "RepoSpecString" };
