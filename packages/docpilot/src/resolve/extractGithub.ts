import type { Forge } from "@docpilot/core";

export type ExtractedRepo = {
  readonly forge: Forge;
  readonly owner: string;
  readonly repo: string;
};

const HOST_TO_FORGE = {
  "github.com": "github",
  "gitlab.com": "gitlab",
  "bitbucket.org": "bitbucket",
} as const satisfies Record<string, Forge>;

const HOST_RE = /(github\.com|gitlab\.com|bitbucket\.org)[/:]([^/\s#?]+)\/([^/\s#?]+)/i;
const SHORTHAND_RE = /^(github|gitlab|bitbucket):([^/\s#?]+)\/([^/\s#?]+)$/i;

/** Pull `{forge, owner, repo}` out of common hosted-git URL forms. */
export function extractRepo(s: string | undefined | null): ExtractedRepo | null {
  if (!s) return null;
  const trimmed = s.trim();

  const shorthand = SHORTHAND_RE.exec(trimmed);
  if (shorthand?.[1] && shorthand[2] && shorthand[3]) {
    return {
      forge: shorthand[1].toLowerCase() as Forge,
      owner: cleanSegment(shorthand[2]),
      repo: cleanRepo(shorthand[3]),
    };
  }

  const m = HOST_RE.exec(trimmed);
  if (!m?.[1] || !m[2] || !m[3]) return null;
  const forge = HOST_TO_FORGE[m[1].toLowerCase() as keyof typeof HOST_TO_FORGE];
  return {
    forge,
    owner: cleanSegment(m[2]),
    repo: cleanRepo(m[3]),
  };
}

/** Pull `{owner, repo}` out of any string that contains a github.com URL. */
export function extractGithub(s: string | undefined | null): { owner: string; repo: string } | null {
  const got = extractRepo(s);
  if (!got || got.forge !== "github") return null;
  return { owner: got.owner, repo: got.repo };
}

function cleanSegment(s: string): string {
  return decodeURIComponent(s.replace(/^:/, "").replace(/^\/+|\/+$/g, ""));
}

function cleanRepo(s: string): string {
  return cleanSegment(s).replace(/\.git$/i, "");
}
