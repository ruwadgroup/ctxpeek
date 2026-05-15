// Resolver orchestrator — registry-first, GitHub-search last.

import type { Ecosystem } from "../config.js";
import type { GithubGraphqlClient } from "../fetch/githubGraphql.js";
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
import { type SearchHit, searchGithub } from "./githubSearch.js";
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
  readonly latestTag?: string | null;
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
  readonly graphql: GithubGraphqlClient | null;
  readonly http: HttpClient;
  readonly logger: Logger;
};

type ResolutionRecord = {
  readonly query: string;
  readonly owner: string;
  readonly repo: string;
  readonly source: ResolutionCandidate["source"];
  readonly stars: number | null;
  readonly defaultBranch: string | null;
  readonly description: string | null;
  readonly latestTag: string | null;
  readonly confidence: number;
  readonly storedAt: string;
};

type ResolutionsFile = {
  readonly version: number;
  readonly entries: Record<string, ResolutionRecord>;
  readonly updatedAt: string;
};

const RESOLUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// v1 stored only owner/repo/source — no stars, no confidence. v2 stores the
// verified GitHub metadata and the original confidence so cache hits don't
// silently elevate weak signals to 0.99.
const RESOLUTION_CACHE_VERSION = 2;

// When the top GitHub-search hit has this many times more stars than the
// registry-resolved winner, mark the result as ambiguous so the planner can
// reconsider. Catches cases like a 0-star npm package shadowing a popular
// repo of the same name.
const AMBIGUITY_STAR_RATIO = 5;

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
          latestTag: meta.latestTag,
          confidence: 1,
        },
        alternatives: [],
        ambiguous: false,
        fromCache: false,
      };
    } catch (err) {
      // 404 here means the literal slug doesn't exist; surface a hard miss
      // instead of falling through to GitHub search (which would silently
      // return a different repo and confuse the caller).
      const isNotFound = err instanceof Error && err.name === "NotFoundError";
      if (isNotFound) {
        return {
          query,
          best: undefined,
          alternatives: [],
          ambiguous: false,
          fromCache: false,
        };
      }
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
          ...(cached.stars !== null ? { stars: cached.stars } : {}),
          ...(cached.defaultBranch !== null ? { defaultBranch: cached.defaultBranch } : {}),
          description: cached.description,
          latestTag: cached.latestTag,
          confidence: cached.confidence,
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
    const verified = await verifyAndEnrich(ctx, winner);
    if (verified) {
      // Skip the side-channel GitHub search when the verified registry hit
      // is already popular enough to dominate any plausible alternative.
      // GitHub's /search/* lives on the 30-req/min bucket — burning a call
      // here for every confident resolve is the largest single contributor
      // to rate-limit pressure.
      const popular = (verified.stars ?? 0) >= 50;
      const ghHits =
        popular || !opts.githubSearchFallback
          ? ([] as ReadonlyArray<SearchHit>)
          : await searchGithub(ctx.rest, ctx.graphql, normalized, 5).catch((err) => {
              ctx.logger.debug("resolve: github search side-channel failed", { err: String(err) });
              return [] as ReadonlyArray<SearchHit>;
            });
      const alts = ghHits
        .filter((h) => !(h.owner === verified.owner && h.repo === verified.repo))
        .slice(0, 4)
        .map(toCandidate);
      const topAlt = alts[0];
      // Only flag ambiguous when the verified winner looks weak (< 50 stars)
      // AND a GH-search alternative dominates it. Otherwise a popular,
      // well-established repo can get false-flagged because an unrelated
      // higher-starred project happened to share a keyword.
      const verifiedStars = verified.stars ?? 0;
      const ambiguous = Boolean(
        verifiedStars < 50 &&
          topAlt &&
          topAlt.stars !== undefined &&
          topAlt.stars > AMBIGUITY_STAR_RATIO * Math.max(1, verifiedStars),
      );
      await writeResolution(opts.cacheFile, normalized, verified);
      return {
        query,
        best: verified,
        alternatives: alts,
        ambiguous,
        fromCache: false,
      };
    }
    // Verification failed (404 or transient) — fall through to GH search.
    ctx.logger.debug("resolve: winner verification failed, falling through", {
      query,
      winner,
    });
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

  const hits = await searchGithub(ctx.rest, ctx.graphql, normalized, 5).catch((err) => {
    ctx.logger.debug("resolve: github search failed", { err: String(err) });
    return [] as ReadonlyArray<SearchHit>;
  });

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
  // GH-search hits don't include the latest release tag. Use the 1-day
  // cached path so back-to-back resolves of trending repos don't keep
  // hitting /releases/latest. First caller per day takes the round-trip;
  // everyone else gets a cache hit.
  const latestTag = await ctx.rest.getLatestTag(first.owner, first.repo).catch(() => null);
  // A 100k-star repo with the exact name shouldn't surface as 0.55 just
  // because a similarly-named but unrelated repo also has stars. If the
  // winner clears 5k stars, treat it as confident regardless of the alt
  // ratio. (The model can still consult `alternatives[]` to second-guess.)
  let confidence: number;
  if (dominant) confidence = 0.85;
  else if (first.stars >= 5000) confidence = 0.9;
  else confidence = 0.55;
  const candidate: ResolutionCandidate = {
    owner: first.owner,
    repo: first.repo,
    source: "github-search",
    stars: first.stars,
    description: first.description,
    defaultBranch: first.defaultBranch,
    latestTag,
    confidence,
  };

  // Treat dominant OR popular-enough winners as confident: cache + return.
  // Only flag ambiguous when the winner is both not-dominant AND not popular.
  if (dominant || first.stars >= 5000) {
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

async function verifyAndEnrich(
  ctx: ResolverContext,
  c: {
    readonly owner: string;
    readonly repo: string;
    readonly source: ResolutionCandidate["source"];
  },
): Promise<ResolutionCandidate | null> {
  try {
    // getRepo() is cached for 7 days and dedupes concurrent callers, so a
    // verify-after-probe-win is essentially free after the first session.
    // latestTag is intentionally left null here; planner-facing renderers
    // call rest.getLatestTag() lazily when they actually need a ref hint.
    const meta = await ctx.rest.getRepo(c.owner, c.repo);
    return {
      owner: meta.owner,
      repo: meta.repo,
      source: c.source,
      stars: meta.stars,
      description: meta.description,
      defaultBranch: meta.defaultBranch,
      latestTag: meta.latestTag,
      confidence: 0.95,
    };
  } catch (err) {
    ctx.logger.debug("resolve: getRepo verification failed", {
      candidate: `${c.owner}/${c.repo}`,
      err: String(err),
    });
    return null;
  }
}

async function readResolution(filePath: string, key: string): Promise<ResolutionRecord | null> {
  const data = await readJson<ResolutionsFile>(filePath);
  if (!data?.entries) return null;
  if (data.version !== RESOLUTION_CACHE_VERSION) return null;
  const entry = data.entries[key];
  if (!entry) return null;
  const age = Date.now() - Date.parse(entry.storedAt);
  if (age > RESOLUTION_TTL_MS) return null;
  return entry;
}

async function writeResolution(
  filePath: string,
  query: string,
  candidate: ResolutionCandidate,
): Promise<void> {
  await updateJson<ResolutionsFile>(filePath, (current) => {
    const existing = current?.version === RESOLUTION_CACHE_VERSION ? (current.entries ?? {}) : {};
    return {
      version: RESOLUTION_CACHE_VERSION,
      entries: {
        ...existing,
        [query]: {
          query,
          owner: candidate.owner,
          repo: candidate.repo,
          source: candidate.source,
          stars: candidate.stars ?? null,
          defaultBranch: candidate.defaultBranch ?? null,
          description: candidate.description ?? null,
          latestTag: candidate.latestTag ?? null,
          confidence: candidate.confidence,
          storedAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date().toISOString(),
    };
  });
}
