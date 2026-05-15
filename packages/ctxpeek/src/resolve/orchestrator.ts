// Resolver orchestrator - registry-first, GitHub-search last.

import type { Ecosystem } from "../config.js";
import type { Forge } from "../core/index.js";
import { type ForgeRegistry, pickForge } from "../fetch/forgeClient.js";
import type { GithubGraphqlClient } from "../fetch/githubGraphql.js";
import type { GithubRestClient, RepoMetadata } from "../fetch/githubRest.js";
import { type HttpClient, type Logger, TimeoutError, withTimeout } from "../util/index.js";
import {
  getRegistry,
  normalizeProbeResult,
  type RegistryCandidate,
  type RegistryProbe,
  type RegistrySearch,
} from "./defineRegistry.js";
import { type SearchHit, searchGithub } from "./githubSearch.js";
import { hasMatchingPackageManifest } from "./packageManifest.js";
import { BUILT_IN_REGISTRIES } from "./registries/index.js";
import { readResolution, recordToCandidate, writeResolution } from "./resolutionCache.js";

// Touching the array keeps the imports "used"; each module already
// registered itself with `defineRegistry` on evaluation.
void BUILT_IN_REGISTRIES;

export type ResolutionCandidate = {
  readonly forge: Forge;
  readonly owner: string;
  readonly repo: string;
  readonly ref?: string;
  readonly subpath?: string;
  readonly source: "cache" | Ecosystem | "github-search" | "literal";
  readonly stars?: number;
  readonly description?: string | null;
  readonly defaultBranch?: string;
  readonly latestTag?: string | null;
  readonly confidence: number;
  readonly registryPackage?: string;
  readonly registryUrl?: string;
  readonly urlField?: string;
  readonly manifestMatch?: boolean;
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
  readonly forges: ForgeRegistry;
  readonly graphql: GithubGraphqlClient | null;
  readonly http: HttpClient;
  readonly logger: Logger;
};

type RegistryHit = RegistryCandidate & {
  readonly source: Ecosystem;
  readonly matchedQuery: string;
};

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
    return emptyResult(query, false);
  }

  const literal = parseLiteralSpec(normalized);
  if (literal) {
    const verified = await verifyLiteral(ctx, literal).catch((err) => {
      ctx.logger.debug("resolve: literal lookup failed", {
        query,
        err: String(err),
      });
      return null;
    });
    if (verified) {
      return {
        query,
        best: verified,
        alternatives: [],
        ambiguous: false,
        fromCache: false,
      };
    }
    return emptyResult(query, false);
  }

  if (!opts.forceRefresh) {
    const cached = await readResolution(opts.cacheFile, normalized);
    if (cached) {
      return {
        query,
        best: recordToCandidate(cached.best),
        alternatives: cached.alternatives.map(recordToCandidate),
        ambiguous: cached.ambiguous,
        fromCache: true,
      };
    }
  }

  const timeoutMs = opts.perProbeTimeoutMs ?? 1500;
  const variants = nameVariants(normalized);
  const directHits = await collectRegistryProbeHits(ctx, opts.ecosystems, variants, timeoutMs);
  const directResult = await resolveRegistryHits(ctx, normalized, directHits, opts);
  if (directResult) return directResult;

  const searchHits = await collectRegistrySearchHits(ctx, opts.ecosystems, normalized, timeoutMs);
  const registrySearchResult = await resolveRegistryHits(ctx, normalized, searchHits, opts);
  if (registrySearchResult) return registrySearchResult;

  if (!opts.githubSearchFallback) {
    return emptyResult(query, false);
  }
  return resolveGithubSearch(ctx, normalized, opts);
}

function emptyResult(query: string, fromCache: boolean): ResolutionResult {
  return {
    query,
    best: undefined,
    alternatives: [],
    ambiguous: false,
    fromCache,
  };
}

async function verifyLiteral(ctx: ResolverContext, spec: LiteralSpec): Promise<ResolutionCandidate | null> {
  try {
    const meta = await getRepoMetadata(ctx, spec.forge, spec.owner, spec.repo);
    return {
      forge: spec.forge,
      owner: meta.owner,
      repo: meta.repo,
      ...(spec.ref !== undefined ? { ref: spec.ref } : {}),
      ...(spec.subpath !== undefined ? { subpath: spec.subpath } : {}),
      source: "literal",
      stars: meta.stars,
      description: meta.description,
      defaultBranch: meta.defaultBranch,
      latestTag: meta.latestTag,
      confidence: 1,
    };
  } catch (err) {
    const isNotFound = err instanceof Error && err.name === "NotFoundError";
    if (isNotFound) return null;
    throw err;
  }
}

async function collectRegistryProbeHits(
  ctx: ResolverContext,
  ecosystems: ReadonlyArray<Ecosystem>,
  variants: ReadonlyArray<string>,
  timeoutMs: number,
): Promise<ReadonlyArray<RegistryHit>> {
  const probes: Array<Promise<ReadonlyArray<RegistryHit>>> = [];
  for (const variant of variants) {
    for (const eco of ecosystems) {
      probes.push(runProbe(ctx, eco, variant, timeoutMs));
    }
  }
  return (await Promise.all(probes)).flat();
}

async function collectRegistrySearchHits(
  ctx: ResolverContext,
  ecosystems: ReadonlyArray<Ecosystem>,
  query: string,
  timeoutMs: number,
): Promise<ReadonlyArray<RegistryHit>> {
  const searches = ecosystems.map((eco) => runRegistrySearch(ctx, eco, query, timeoutMs));
  return (await Promise.all(searches)).flat();
}

async function resolveRegistryHits(
  ctx: ResolverContext,
  query: string,
  hits: ReadonlyArray<RegistryHit>,
  opts: ResolverOptions,
): Promise<ResolutionResult | null> {
  const rankedHits = dedupeRegistryHits(query, hits).slice(0, 10);
  if (rankedHits.length === 0) return null;

  const verified = (
    await Promise.all(
      rankedHits.map(async (hit) => {
        const enriched = await verifyAndEnrich(ctx, hit);
        if (!enriched) return null;
        const manifestMatch = await hasMatchingPackageManifest(ctx, enriched, hit).catch(() => false);
        return scoreRegistryCandidate(query, enriched, hit, manifestMatch);
      }),
    )
  )
    .filter((c): c is ResolutionCandidate => Boolean(c))
    .sort(compareCandidates);

  const best = verified[0];
  if (!best) return null;

  // Skip the side-channel GitHub search when the verified registry hit is
  // already popular enough to dominate any plausible alternative.
  const popular = best.forge === "github" && (best.stars ?? 0) >= 50;
  const ghHits =
    popular || !opts.githubSearchFallback
      ? ([] as ReadonlyArray<SearchHit>)
      : await searchGithub(ctx.rest, ctx.graphql, query, 5).catch((err) => {
          ctx.logger.debug("resolve: github search side-channel failed", { err: String(err) });
          return [] as ReadonlyArray<SearchHit>;
        });
  const ghAlts = ghHits
    .filter((h) => !sameRepo(h, best))
    .slice(0, 4)
    .map((h) => toCandidate(h, 0.5));
  const registryAlts = verified.slice(1);
  const alternatives = dedupeCandidates([...registryAlts, ...ghAlts], best).slice(0, 4);
  const ambiguous = isRegistryAmbiguous(best, registryAlts[0], ghAlts[0]);

  await writeResolution(opts.cacheFile, query, best, alternatives, ambiguous);
  return {
    query,
    best,
    alternatives,
    ambiguous,
    fromCache: false,
  };
}

async function resolveGithubSearch(
  ctx: ResolverContext,
  normalized: string,
  opts: ResolverOptions,
): Promise<ResolutionResult> {
  const hits = await searchGithub(ctx.rest, ctx.graphql, normalized, 5).catch((err) => {
    ctx.logger.debug("resolve: github search failed", { err: String(err) });
    return [] as ReadonlyArray<SearchHit>;
  });

  if (hits.length === 0) {
    return emptyResult(normalized, false);
  }

  const ranked = [...hits].sort((a, b) => b.stars - a.stars);
  const first = ranked[0];
  if (!first) return emptyResult(normalized, false);
  const second = ranked[1];
  const dominant = !second || first.stars > 10 * Math.max(1, second.stars);
  const latestTag = await ctx.rest.getLatestTag(first.owner, first.repo).catch(() => null);

  let confidence: number;
  if (dominant) confidence = 0.85;
  else if (first.stars >= 5000) confidence = 0.9;
  else confidence = 0.55;

  const candidate: ResolutionCandidate = {
    forge: "github",
    owner: first.owner,
    repo: first.repo,
    source: "github-search",
    stars: first.stars,
    description: first.description,
    defaultBranch: first.defaultBranch,
    latestTag,
    confidence,
  };
  const alternatives = ranked.slice(1, 5).map((hit) => toCandidate(hit, 0.5));
  const ambiguous = !(dominant || first.stars >= 5000);

  await writeResolution(opts.cacheFile, normalized, candidate, alternatives, ambiguous);
  return {
    query: normalized,
    best: candidate,
    alternatives,
    ambiguous,
    fromCache: false,
  };
}

type LiteralSpec = {
  readonly forge: Forge;
  readonly owner: string;
  readonly repo: string;
  readonly ref?: string;
  readonly subpath?: string;
};

const LITERAL_RE =
  /^(?:(github|gh|gitlab|gl|bitbucket|bb):)?([A-Za-z0-9][\w.-]*)\/([A-Za-z0-9][\w.-]*)(?:@([^#\s]+))?(?:#(.+))?$/;

const FORGE_ALIASES = {
  github: "github",
  gh: "github",
  gitlab: "gitlab",
  gl: "gitlab",
  bitbucket: "bitbucket",
  bb: "bitbucket",
} as const satisfies Record<string, Forge>;

function parseLiteralSpec(q: string): LiteralSpec | null {
  const m = LITERAL_RE.exec(q);
  if (!m?.[2] || !m[3]) return null;
  const forge = m[1] ? FORGE_ALIASES[m[1].toLowerCase() as keyof typeof FORGE_ALIASES] : "github";
  return {
    forge,
    owner: m[2],
    repo: m[3],
    ...(m[4] ? { ref: m[4] } : {}),
    ...(m[5] ? { subpath: m[5].replace(/^\/+/, "").replace(/\/+$/, "") } : {}),
  };
}

function nameVariants(q: string): string[] {
  const lower = q.toLowerCase();
  const out = new Set<string>([lower]);
  out.add(lower.replace(/\s+/g, "-"));
  out.add(lower.replace(/\s+/g, ""));
  if (!lower.endsWith("css") && lower === "tailwind") out.add("tailwindcss");
  return [...out];
}

function toCandidate(h: SearchHit, confidence: number): ResolutionCandidate {
  return {
    forge: "github",
    owner: h.owner,
    repo: h.repo,
    source: "github-search",
    stars: h.stars,
    description: h.description,
    defaultBranch: h.defaultBranch,
    confidence,
  };
}

async function runProbe(
  ctx: ResolverContext,
  eco: Ecosystem,
  name: string,
  timeoutMs: number,
): Promise<ReadonlyArray<RegistryHit>> {
  const probe = pickProbe(eco);
  if (!probe) return [];
  try {
    const result = await withTimeout(probe(name, ctx.http, timeoutMs), timeoutMs + 250);
    return normalizeProbeResult(result).map((candidate) => ({
      ...candidate,
      source: eco,
      matchedQuery: name,
    }));
  } catch (err) {
    if (!(err instanceof TimeoutError)) {
      ctx.logger.debug("resolve: probe failed", { eco, name, err: String(err) });
    }
    return [];
  }
}

async function runRegistrySearch(
  ctx: ResolverContext,
  eco: Ecosystem,
  query: string,
  timeoutMs: number,
): Promise<ReadonlyArray<RegistryHit>> {
  const search = pickSearch(eco);
  if (!search) return [];
  try {
    const result = await withTimeout(search(query, ctx.http, timeoutMs), timeoutMs + 250);
    return result.map((candidate) => ({
      ...candidate,
      source: eco,
      matchedQuery: query,
    }));
  } catch (err) {
    if (!(err instanceof TimeoutError)) {
      ctx.logger.debug("resolve: registry search failed", { eco, query, err: String(err) });
    }
    return [];
  }
}

function pickProbe(eco: Ecosystem): RegistryProbe | null {
  return getRegistry(eco)?.probe ?? null;
}

function pickSearch(eco: Ecosystem): RegistrySearch | null {
  return getRegistry(eco)?.search ?? null;
}

async function verifyAndEnrich(ctx: ResolverContext, hit: RegistryHit): Promise<ResolutionCandidate | null> {
  try {
    const meta = await getRepoMetadata(ctx, hit.forge, hit.owner, hit.repo);
    return {
      forge: hit.forge,
      owner: meta.owner,
      repo: meta.repo,
      ...(hit.subpath !== undefined ? { subpath: hit.subpath } : {}),
      source: hit.source,
      stars: meta.stars,
      description: meta.description,
      defaultBranch: meta.defaultBranch,
      latestTag: meta.latestTag,
      confidence: hit.confidence,
      registryPackage: hit.packageName,
      ...(hit.registryUrl !== undefined ? { registryUrl: hit.registryUrl } : {}),
      urlField: hit.urlField,
    };
  } catch (err) {
    ctx.logger.debug("resolve: getRepo verification failed", {
      candidate: `${hit.forge}:${hit.owner}/${hit.repo}`,
      err: String(err),
    });
    return null;
  }
}

async function getRepoMetadata(
  ctx: ResolverContext,
  forge: Forge,
  owner: string,
  repo: string,
): Promise<RepoMetadata> {
  if (forge === "github") return ctx.rest.getRepo(owner, repo);
  return pickForge(ctx.forges, forge).getRepo(owner, repo);
}

function scoreRegistryCandidate(
  query: string,
  candidate: ResolutionCandidate,
  hit: RegistryHit,
  manifestMatch: boolean,
): ResolutionCandidate {
  let confidence = hit.confidence;
  const queryNames = new Set(nameVariants(query).map(normalizeName));
  const packageName = normalizeName(hit.packageName);
  const packageLeaf = normalizeName(leafName(hit.packageName));
  if (queryNames.has(packageName)) confidence += 0.04;
  else if (queryNames.has(packageLeaf)) confidence += 0.02;
  if (manifestMatch) confidence += 0.06;
  if (namesEqual(candidate.repo, leafName(hit.packageName))) confidence += 0.015;
  confidence += Math.min(0.04, Math.log10((candidate.stars ?? 0) + 1) / 100);

  return {
    ...candidate,
    confidence: clampConfidence(confidence),
    manifestMatch,
  };
}

function dedupeRegistryHits(query: string, hits: ReadonlyArray<RegistryHit>): ReadonlyArray<RegistryHit> {
  const byRepo = new Map<string, RegistryHit>();
  for (const hit of hits) {
    const key = repoKey(hit);
    const prev = byRepo.get(key);
    if (!prev || preliminaryScore(query, hit) > preliminaryScore(query, prev)) {
      byRepo.set(key, hit);
    }
  }
  return [...byRepo.values()].sort((a, b) => preliminaryScore(query, b) - preliminaryScore(query, a));
}

function preliminaryScore(query: string, hit: RegistryHit): number {
  const exact = nameVariants(query).some((v) => normalizeName(v) === normalizeName(hit.packageName));
  return hit.confidence + (exact ? 0.04 : 0);
}

function compareCandidates(a: ResolutionCandidate, b: ResolutionCandidate): number {
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  return (b.stars ?? 0) - (a.stars ?? 0);
}

function dedupeCandidates(
  candidates: ReadonlyArray<ResolutionCandidate>,
  best: ResolutionCandidate,
): ReadonlyArray<ResolutionCandidate> {
  const out: ResolutionCandidate[] = [];
  const seen = new Set<string>([repoKey(best)]);
  for (const candidate of [...candidates].sort(compareCandidates)) {
    const key = repoKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function isRegistryAmbiguous(
  best: ResolutionCandidate,
  registryAlt: ResolutionCandidate | undefined,
  githubAlt: ResolutionCandidate | undefined,
): boolean {
  const closeRegistryAlt = Boolean(registryAlt && registryAlt.confidence >= best.confidence - 0.06);
  const bestStars = best.forge === "github" ? (best.stars ?? 0) : 0;
  const starAmbiguous = Boolean(
    bestStars < 50 &&
      githubAlt?.stars !== undefined &&
      githubAlt.stars > AMBIGUITY_STAR_RATIO * Math.max(1, bestStars),
  );
  return closeRegistryAlt || starAmbiguous;
}

function sameRepo(a: { forge?: Forge; owner: string; repo: string }, b: ResolutionCandidate): boolean {
  return (a.forge ?? "github") === b.forge && repoKey(a) === repoKey(b);
}

function repoKey(c: { forge?: Forge; owner: string; repo: string }): string {
  return `${c.forge ?? "github"}:${c.owner.toLowerCase()}/${c.repo.toLowerCase()}`;
}

function leafName(name: string): string {
  return name.split("/").filter(Boolean).pop() ?? name;
}

function normalizeName(s: string | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[\s._-]/g, "");
}

function namesEqual(a: string | undefined, b: string | undefined): boolean {
  return Boolean(a && b && normalizeName(a) === normalizeName(b));
}

function clampConfidence(n: number): number {
  return Math.min(0.99, Math.max(0.5, Number(n.toFixed(3))));
}
