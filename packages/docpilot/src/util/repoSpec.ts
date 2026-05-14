// Parser for `[forge:]owner/repo[@ref][#subpath]`. Forge aliases come from the registry.
import { type Forge, InvalidRepoSpecError, type RepoSpec } from "@docpilot/core";

const SPEC_RE = /^(?:(gh|github|gitlab|gl|bitbucket|bb):)?([^/\s]+)\/([^/\s@#]+)(?:@([^#\s]+))?(?:#(.+))?$/;

const FORGE_ALIAS: Record<string, Forge> = {
  gh: "github",
  github: "github",
  gl: "gitlab",
  gitlab: "gitlab",
  bb: "bitbucket",
  bitbucket: "bitbucket",
};

export function parseRepoSpec(input: string): RepoSpec {
  const trimmed = input.trim();
  const match = SPEC_RE.exec(trimmed);
  if (!match) {
    throw new InvalidRepoSpecError(input, "expected `[forge:]owner/repo[@ref][#subpath]`");
  }
  const [, forgePrefix, owner, repo, ref, subpath] = match;
  if (!owner || !repo) {
    throw new InvalidRepoSpecError(input, "owner and repo are required");
  }
  const forge: Forge = forgePrefix ? (FORGE_ALIAS[forgePrefix] ?? "github") : "github";
  return {
    forge,
    owner,
    repo,
    ref: ref,
    subpath: subpath ? subpath.replace(/^\/+/, "").replace(/\/+$/, "") || undefined : undefined,
  };
}
