// Resolver orchestrator — registry-first, GitHub-search last.

import type { Ecosystem } from "../config.js";
import type { GithubRestClient } from "../fetch/githubRest.js";
import {
  type HttpClient,
  type Logger,
  raceUntil,
  readJson,
  TimeoutError,
  updateJson,
  withTimeout,
} from "../util/index.js";
import { getRegistry, type RegistryProbe } from "./defineRegistry.js";
import { searchGithub } from "./githubSearch.js";
import { BUILT_IN_REGISTRIES } from "./registries/index.js";

// Touching the array keeps the imports "used"; each module already
// registered itself with `defineRegistry` on evaluation.
void BUILT_IN_REGISTRIES;

export type ResolutionCandidate = {
  readonly owner: string;
  readonly repo: string;
  readonly source: "cache" | Ecosystem | "github-search" | "literal";
  readonly stars?: number;
  readonly description?: string | null;
  readonly defaultBranch?: string;
  readonly confidence: number;
};

export type ResolutionResult = {
  readonly query: string;
  readonly best: ResolutionCandidate | undefined;
  readonly alternatives: ReadonlyArray<ResolutionCandidate>;
  readonly ambiguous: boolean;
  readonly fromCache: boolean;
};

export type ResolverOptions = {
  readonly ecosystems: ReadonlyArray<Ecosystem>;
  readonly githubSearchFallback: boolean;
  readonly cacheFile: string;
  readonly perProbeTimeoutMs?: number;
  readonly forceRefresh?: boolean;
};

export type ResolverContext = {
  readonly rest: GithubRestClient;
  readonly http: HttpClient;
  readonly logger: Logger;
};

type ResolutionRecord = {
  readonly query: string;
  readonly owner: string;
  readonly repo: string;
  readonly source: ResolutionCandidate["source"];
  readonly storedAt: string;
};

type ResolutionsFile = {
  readonly entries: Record<string, ResolutionRecord>;
  readonly updatedAt: string;
};

const RESOLUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function resolve(
  ctx: ResolverContext,
  query: string,
  opts: ResolverOptions,
): Promise<ResolutionResult> {
  const normalized = query.trim();
  if (!normalized) {
    return {
      query,
      best: undefined,
      alternatives: [],
      ambiguous: false,
      fromCache: false,
    };
  }

  if (LITERAL_RE.test(normalized)) {
    const [owner, repo] = normalized.split("/") as [string, string];
    try {
      const meta = await ctx.rest.getRepo(owner, repo);
      return {
        query,
        best: {
          owner: meta.owner,
          repo: meta.repo,
          source: "literal",
          stars: meta.stars,
          description: meta.description,
          defaultBranch: meta.defaultBranch,
          confidence: 1,
        },
        alternatives: [],
        ambiguous: false,
        fromCache: false,
      };
    } catch (err) {
      ctx.logger.debug("resolve: literal lookup failed", {
        query,
        err: String(err),
      });
    }
  }

  if (!opts.forceRefresh) {
    const cached = await readResolution(opts.cacheFile, normalized);
    if (cached) {
      return {
        query,
        best: {
          owner: cached.owner,
          repo: cached.repo,
          source: cached.source,
          confidence: 0.99,
        },
        alternatives: [],
        ambiguous: false,
        fromCache: true,
      };
    }
  }

  const variants = nameVariants(normalized);
  const probes: Array<
    Promise<{
      owner: string;
      repo: string;
      source: ResolutionCandidate["source"];
    } | null>
  > = [];
  for (const variant of variants) {
    for (const eco of opts.ecosystems) {
      probes.push(runProbe(ctx, eco, variant, opts.perProbeTimeoutMs ?? 1500));
    }
  }

  const winner = await raceUntil(probes, (v) => Boolean(v));
  if (winner) {
    await writeResolution(opts.cacheFile, normalized, winner);
    return {
      query,
      best: { ...winner, confidence: 0.95 },
      alternatives: [],
      ambiguous: false,
      fromCache: false,
    };
  }

  if (!opts.githubSearchFallback) {
    return {
      query,
      best: undefined,
      alternatives: [],
      ambiguous: false,
      fromCache: false,
    };
  }

  let hits: ReadonlyArray<{
    owner: string;
    repo: string;
    stars: number;
    description: string | null;
    defaultBranch: string;
  }> = [];
  try {
    hits = await searchGithub(ctx.rest, normalized, 5);
  } catch (err) {
    ctx.logger.warn("resolve: github search failed", { err: String(err) });
    return {
      query,
      best: undefined,
      alternatives: [],
      ambiguous: false,
      fromCache: false,
    };
  }

  if (hits.length === 0) {
    return {
      query,
      best: undefined,
      alternatives: [],
      ambiguous: false,
      fromCache: false,
    };
  }

  const ranked = [...hits].sort((a, b) => b.stars - a.stars);
  const first = ranked[0];
  if (!first)
    return {
      query,
      best: undefined,
      alternatives: [],
      ambiguous: false,
      fromCache: false,
    };
  const second = ranked[1];
  const dominant = !second || first.stars > 10 * Math.max(1, second.stars);
  const candidate: ResolutionCandidate = {
    owner: first.owner,
    repo: first.repo,
    source: "github-search",
    stars: first.stars,
    description: first.description,
    defaultBranch: first.defaultBranch,
    confidence: dominant ? 0.85 : 0.55,
  };

  if (dominant) {
    await writeResolution(opts.cacheFile, normalized, candidate);
    return {
      query,
      best: candidate,
      alternatives: ranked.slice(1, 5).map(toCandidate),
      ambiguous: false,
      fromCache: false,
    };
  }

  return {
    query,
    best: candidate,
    alternatives: ranked.slice(1, 5).map(toCandidate),
    ambiguous: true,
    fromCache: false,
  };
}

const LITERAL_RE = /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/;

function nameVariants(q: string): string[] {
  const out = new Set<string>([q.toLowerCase()]);
  out.add(q.toLowerCase().replace(/\s+/g, "-"));
  out.add(q.toLowerCase().replace(/\s+/g, ""));
  if (!q.endsWith("css") && q.toLowerCase() === "tailwind") out.add("tailwindcss");
  return [...out];
}

function toCandidate(h: {
  owner: string;
  repo: string;
  stars: number;
  description: string | null;
  defaultBranch: string;
}): ResolutionCandidate {
  return {
    owner: h.owner,
    repo: h.repo,
    source: "github-search",
    stars: h.stars,
    description: h.description,
    defaultBranch: h.defaultBranch,
    confidence: 0.5,
  };
}

async function runProbe(
  ctx: ResolverContext,
  eco: Ecosystem,
  name: string,
  timeoutMs: number,
): Promise<{
  owner: string;
  repo: string;
  source: ResolutionCandidate["source"];
} | null> {
  const probe = pickProbe(eco);
  if (!probe) return null;
  try {
    const result = await withTimeout(probe(name, ctx.http, timeoutMs), timeoutMs + 250);
    if (!result) return null;
    return { ...result, source: eco };
  } catch (err) {
    if (!(err instanceof TimeoutError)) {
      ctx.logger.debug("resolve: probe failed", { eco, name, err: String(err) });
    }
    return null;
  }
}

function pickProbe(eco: Ecosystem): RegistryProbe | null {
  return getRegistry(eco)?.probe ?? null;
}

async function readResolution(filePath: string, key: string): Promise<ResolutionRecord | null> {
  const data = await readJson<ResolutionsFile>(filePath);
  if (!data?.entries) return null;
  const entry = data.entries[key];
  if (!entry) return null;
  const age = Date.now() - Date.parse(entry.storedAt);
  if (age > RESOLUTION_TTL_MS) return null;
  return entry;
}

async function writeResolution(
  filePath: string,
  query: string,
  record: { owner: string; repo: string; source: ResolutionCandidate["source"] },
): Promise<void> {
  await updateJson<ResolutionsFile>(filePath, (current) => ({
    entries: {
      ...current?.entries,
      [query]: {
        query,
        owner: record.owner,
        repo: record.repo,
        source: record.source,
        storedAt: new Date().toISOString(),
      },
    },
    updatedAt: new Date().toISOString(),
  }));
}
