import type { Ecosystem } from "../config.js";
import { pickForge } from "../fetch/forgeClient.js";
import { getPackageManifest } from "./definePackageManifest.js";
import type { ResolutionCandidate, ResolverContext } from "./orchestrator.js";
import { BUILT_IN_PACKAGE_MANIFESTS } from "./packageManifests/index.js";

void BUILT_IN_PACKAGE_MANIFESTS;

export type PackageEvidence = {
  readonly source: Ecosystem;
  readonly packageName: string;
  readonly subpath?: string;
};

export async function hasMatchingPackageManifest(
  ctx: ResolverContext,
  candidate: ResolutionCandidate,
  evidence: PackageEvidence,
): Promise<boolean> {
  const verifier = getPackageManifest(evidence.source);
  if (!verifier) return false;

  for (const subpath of candidateSubpaths(evidence, verifier.candidateSubpaths)) {
    for (const filename of verifier.filenames) {
      const text = await getManifestContents(ctx, candidate, joinPath(subpath, filename)).catch(() => null);
      if (!text) continue;
      try {
        if (verifier.matches(text, evidence.packageName)) return true;
      } catch {
        // A malformed manifest is just a missing positive signal.
      }
    }
  }
  return false;
}

function candidateSubpaths(
  evidence: PackageEvidence,
  extraSubpaths: ((packageName: string) => ReadonlyArray<string>) | undefined,
): ReadonlyArray<string | undefined> {
  const out = new Set<string | undefined>();
  if (evidence.subpath) out.add(cleanSubpath(evidence.subpath));
  out.add(undefined);
  for (const subpath of extraSubpaths?.(evidence.packageName) ?? []) {
    out.add(cleanSubpath(subpath));
  }
  return [...out];
}

async function getManifestContents(
  ctx: ResolverContext,
  candidate: ResolutionCandidate,
  filePath: string,
): Promise<string | null> {
  if (!candidate.defaultBranch) return null;
  const client = candidate.forge === "github" ? ctx.rest : pickForge(ctx.forges, candidate.forge);
  const result = await client.getContents(candidate.owner, candidate.repo, filePath, candidate.defaultBranch);
  if (result.status !== 200 || !result.bytes) return null;
  return Buffer.from(result.bytes).toString("utf8");
}

function joinPath(subpath: string | undefined, filename: string): string {
  return subpath ? `${subpath}/${filename}` : filename;
}

function cleanSubpath(subpath: string): string {
  return subpath.replace(/^\/+/, "").replace(/\/+$/, "");
}
