/**
 * Parser for the canonical repo string.
 *
 *   owner/repo[@ref][#subpath]
 *
 * Rules (design doc §5):
 *   - exactly one slash inside owner/repo (case-insensitive vs canonical)
 *   - @ref accepts: branch | tag | full sha | short sha (≥7 chars)
 *   - #subpath leading-slash stripped, trailing-slash optional
 */
import { InvalidRepoSpecError, type RepoSpec } from "@docpilot/core";

const SPEC_RE = /^([^/\s]+)\/([^/\s@#]+)(?:@([^#\s]+))?(?:#(.+))?$/;

export function parseRepoSpec(input: string): RepoSpec {
  const trimmed = input.trim();
  const match = SPEC_RE.exec(trimmed);
  if (!match) {
    throw new InvalidRepoSpecError(input, "expected `owner/repo[@ref][#subpath]`");
  }
  const [, owner, repo, ref, subpath] = match;
  if (!owner || !repo) {
    throw new InvalidRepoSpecError(input, "owner and repo are required");
  }
  return {
    owner,
    repo,
    ref: ref,
    subpath: subpath ? subpath.replace(/^\/+/, "").replace(/\/+$/, "") || undefined : undefined,
  };
}
