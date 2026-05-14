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
export type DocFrontmatter = {
  readonly repo: string;
  readonly ref: string;
  readonly commit: string;
  readonly path: string;
  readonly size: number;
  readonly lastModified?: string;
  readonly source?: "cache" | "rest" | "cdn" | "graphql";
  readonly tokensApprox: number;
  readonly summary?: string;
};

export function renderFrontmatter(fm: DocFrontmatter): string {
  const lines = ["---"];
  lines.push(`repo: ${fm.repo}`);
  lines.push(`ref: ${escapeYaml(fm.ref)}`);
  lines.push(`commit: ${fm.commit}`);
  lines.push(`path: ${escapeYaml(fm.path)}`);
  lines.push(`size: ${fm.size}`);
  if (fm.lastModified) lines.push(`last_modified: ${fm.lastModified}`);
  if (fm.source) lines.push(`source: ${fm.source}`);
  lines.push(`~tokens: ${fm.tokensApprox}`);
  if (fm.summary) lines.push(`summary: ${escapeYaml(fm.summary)}`);
  lines.push("---");
  return lines.join("\n");
}

/** Rough char→token estimator (text.length / 4). See §14 Tier S #2. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function escapeYaml(v: string): string {
  if (/^[A-Za-z0-9._/+:@-]+$/.test(v)) return v;
  return JSON.stringify(v);
}
