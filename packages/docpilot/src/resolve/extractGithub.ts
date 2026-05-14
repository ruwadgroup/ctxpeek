const GH_RE = /github\.com[/:]([^/\s]+)\/([^/\s#?]+)/i;

/** Pull `{owner, repo}` out of any string that contains a github.com URL. */
export function extractGithub(s: string | undefined | null): { owner: string; repo: string } | null {
  if (!s) return null;
  const m = GH_RE.exec(s);
  if (!m || !m[1] || !m[2]) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}
