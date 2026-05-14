/**
 * YAML frontmatter renderer for `fetch_doc` and friends.
 *
 *   ---
 *   repo: vercel/next.js
 *   ref: v15.0.0
 *   commit: a3b1f7c
 *   path: docs/.../routing.mdx
 *   size: 8923
 *   ~tokens: 2150
 *   ---
 *
 * Doubles as machine-parseable metadata.
 */
export interface DocFrontmatter {
  readonly repo: string;
  readonly ref: string;
  readonly commit: string;
  readonly path: string;
  readonly size: number;
  readonly lastModified?: string;
  readonly tokensApprox: number;
}

export function renderFrontmatter(_fm: DocFrontmatter): string {
  // TODO(v0.1, day-2): js-yaml dump with field ordering preserved
  throw new Error("not implemented");
}

/** Rough char→token estimator (text.length / 4). See §14 Tier S #2. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
