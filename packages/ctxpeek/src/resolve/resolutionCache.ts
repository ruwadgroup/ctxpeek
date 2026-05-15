import type { Forge } from "../core/index.js";
import { readJson, updateJson } from "../util/index.js";
import type { ResolutionCandidate } from "./orchestrator.js";

type CandidateRecord = {
  readonly forge: Forge;
  readonly owner: string;
  readonly repo: string;
  readonly subpath: string | null;
  readonly source: ResolutionCandidate["source"];
  readonly stars: number | null;
  readonly defaultBranch: string | null;
  readonly description: string | null;
  readonly latestTag: string | null;
  readonly confidence: number;
  readonly registryPackage: string | null;
  readonly registryUrl: string | null;
  readonly urlField: string | null;
  readonly manifestMatch: boolean | null;
};

export type ResolutionRecord = {
  readonly query: string;
  readonly best: CandidateRecord;
  readonly alternatives: ReadonlyArray<CandidateRecord>;
  readonly ambiguous: boolean;
  readonly storedAt: string;
};

type ResolutionsFile = {
  readonly version: number;
  readonly entries: Record<string, ResolutionRecord>;
  readonly updatedAt: string;
};

const RESOLUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// v3 stores forge, ambiguity, and alternatives so weak cached resolutions stay
// reviewable instead of becoming a context-free winner for the next 30 days.
const RESOLUTION_CACHE_VERSION = 3;

export async function readResolution(filePath: string, key: string): Promise<ResolutionRecord | null> {
  const data = await readJson<ResolutionsFile>(filePath);
  if (!data?.entries) return null;
  if (data.version !== RESOLUTION_CACHE_VERSION) return null;
  const entry = data.entries[key];
  if (!entry) return null;
  const age = Date.now() - Date.parse(entry.storedAt);
  if (age > RESOLUTION_TTL_MS) return null;
  return entry;
}

export async function writeResolution(
  filePath: string,
  query: string,
  candidate: ResolutionCandidate,
  alternatives: ReadonlyArray<ResolutionCandidate>,
  ambiguous: boolean,
): Promise<void> {
  await updateJson<ResolutionsFile>(filePath, (current) => {
    const existing = current?.version === RESOLUTION_CACHE_VERSION ? (current.entries ?? {}) : {};
    return {
      version: RESOLUTION_CACHE_VERSION,
      entries: {
        ...existing,
        [query]: {
          query,
          best: candidateToRecord(candidate),
          alternatives: alternatives.map(candidateToRecord),
          ambiguous,
          storedAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date().toISOString(),
    };
  });
}

export function recordToCandidate(record: ResolutionRecord["best"]): ResolutionCandidate {
  return {
    forge: record.forge,
    owner: record.owner,
    repo: record.repo,
    ...(record.subpath !== null ? { subpath: record.subpath } : {}),
    source: record.source,
    ...(record.stars !== null ? { stars: record.stars } : {}),
    ...(record.defaultBranch !== null ? { defaultBranch: record.defaultBranch } : {}),
    description: record.description,
    latestTag: record.latestTag,
    confidence: record.confidence,
    ...(record.registryPackage !== null ? { registryPackage: record.registryPackage } : {}),
    ...(record.registryUrl !== null ? { registryUrl: record.registryUrl } : {}),
    ...(record.urlField !== null ? { urlField: record.urlField } : {}),
    ...(record.manifestMatch !== null ? { manifestMatch: record.manifestMatch } : {}),
  };
}

function candidateToRecord(candidate: ResolutionCandidate): CandidateRecord {
  return {
    forge: candidate.forge,
    owner: candidate.owner,
    repo: candidate.repo,
    subpath: candidate.subpath ?? null,
    source: candidate.source,
    stars: candidate.stars ?? null,
    defaultBranch: candidate.defaultBranch ?? null,
    description: candidate.description ?? null,
    latestTag: candidate.latestTag ?? null,
    confidence: candidate.confidence,
    registryPackage: candidate.registryPackage ?? null,
    registryUrl: candidate.registryUrl ?? null,
    urlField: candidate.urlField ?? null,
    manifestMatch: candidate.manifestMatch ?? null,
  };
}
