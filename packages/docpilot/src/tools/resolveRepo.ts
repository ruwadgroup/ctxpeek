import * as path from "node:path";
import { z } from "zod";
import type { Ecosystem } from "../config.js";
import { type DetectedManifest, detectManifests, installSuggestion, type LockedDep } from "../lockfile.js";
import { type ResolutionCandidate, resolve } from "../resolve/orchestrator.js";
import type { ToolContext } from "./context.js";

export const resolveRepoInput = z.object({
  query: z.string().min(1),
  ecosystem: z.enum(["npm", "pypi", "crates", "go", "rubygems", "packagist", "hex"]).optional(),
  force_refresh: z.boolean().optional(),
});

export type ResolveRepoInput = z.infer<typeof resolveRepoInput>;

export type ResolveRepoStructured = {
  readonly owner: string;
  readonly repo: string;
  readonly source: string;
  readonly stars: number | null;
  readonly default_branch: string | null;
  readonly latest_tag: string | null;
  readonly confidence: number;
  readonly alternatives: ReadonlyArray<{
    owner: string;
    repo: string;
    stars: number | null;
  }>;
};

export type ResolveRepoOutput = {
  readonly markdown: string;
  readonly structured: ResolveRepoStructured | null;
};

export function buildResolveRepoTool(ctx: ToolContext) {
  return async (input: ResolveRepoInput): Promise<ResolveRepoOutput> => {
    const defaultEcosystems = input.ecosystem ? [input.ecosystem] : ctx.config.resolve.ecosystems;

    // Manifest-aware preflight: if the user is in a project that depends on
    // a package whose name (or scope) matches the query, use the exact
    // package name as the resolver input. This is the difference between
    // "autotranslate" → `eJayYoung/autoTranslate` (random npm package) and
    // "autotranslate" → `tamimbinhakim/autotranslate` (the one the user
    // actually imports as `@autotranslate/*`).
    const manifestHit = input.ecosystem ? null : await findManifestMatch(input.query).catch(() => null);
    const resolveQuery = manifestHit?.depName ?? input.query;
    const resolveEcosystems = manifestHit ? [manifestHit.ecosystem] : defaultEcosystems;

    const raw = await resolve(
      { rest: ctx.rest, graphql: ctx.graphql, http: ctx.http, logger: ctx.logger },
      resolveQuery,
      {
        ecosystems: resolveEcosystems,
        githubSearchFallback: ctx.config.resolve.githubSearchFallback,
        cacheFile: ctx.config.paths.resolutionsFile,
        ...(input.force_refresh ? { forceRefresh: true } : {}),
      },
    );

    if (!raw.best) {
      return {
        markdown: renderNotFound(input.query),
        structured: null,
      };
    }

    // `latestTag` is no longer fetched eagerly in the resolver hot path; do
    // it here lazily through the 1-day cache. First call per repo per day
    // costs one /releases/latest hit, subsequent calls are free.
    const result = raw.best.latestTag
      ? raw
      : {
          ...raw,
          best: {
            ...raw.best,
            latestTag: await ctx.rest.getLatestTag(raw.best.owner, raw.best.repo).catch(() => null),
          },
        };
    if (!result.best) {
      return {
        markdown: renderNotFound(input.query),
        structured: null,
      };
    }

    const installSuggestionLine = await offerToInstall(input.query, result.best);
    const manifestNote = manifestHit
      ? `> Matched **${manifestHit.depName}** from your ${path.basename(manifestHit.manifestFile)} (scope/name alias of "${input.query}").`
      : null;

    if (result.ambiguous) {
      return {
        markdown: renderAmbiguous(
          input.query,
          result.best,
          result.alternatives,
          installSuggestionLine,
          manifestNote,
        ),
        structured: candidateToStructured(result.best, result.alternatives),
      };
    }

    return {
      markdown: renderResolved(
        input.query,
        result.best,
        result.alternatives,
        result.fromCache,
        installSuggestionLine,
        manifestNote,
      ),
      structured: candidateToStructured(result.best, result.alternatives),
    };
  };
}

type ManifestMatch = {
  readonly depName: string;
  readonly ecosystem: Ecosystem;
  readonly manifestFile: string;
};

async function findManifestMatch(query: string): Promise<ManifestMatch | null> {
  const manifests = await detectManifests(process.cwd());
  if (manifests.length === 0) return null;
  const normQuery = normaliseDepName(query);

  // Exact normalised match (e.g. query "react" matches dep "react").
  for (const m of manifests) {
    for (const dep of m.deps) {
      if (normaliseDepName(dep.name) === normQuery) {
        return { depName: dep.name, ecosystem: m.ecosystem, manifestFile: m.file };
      }
    }
  }

  // Scope match (e.g. query "autotranslate" matches dep "@autotranslate/core").
  // Prefer the alphabetically-first scoped package so the result is stable
  // across pnpm/npm install order; the resolver will dedupe via repo URL.
  const scopeMatches = collectScopeMatches(manifests, normQuery);
  if (scopeMatches.length > 0) {
    const first = [...scopeMatches].sort((a, b) => a.depName.localeCompare(b.depName))[0];
    return first ?? null;
  }

  return null;
}

function collectScopeMatches(
  manifests: ReadonlyArray<DetectedManifest>,
  normQuery: string,
): ReadonlyArray<ManifestMatch> {
  const out: ManifestMatch[] = [];
  for (const m of manifests) {
    for (const dep of m.deps) {
      const scope = scopeOf(dep.name);
      if (scope && normaliseDepName(scope) === normQuery) {
        out.push({ depName: dep.name, ecosystem: m.ecosystem, manifestFile: m.file });
      }
    }
  }
  return out;
}

function scopeOf(name: string): string | null {
  if (!name.startsWith("@")) return null;
  const slash = name.indexOf("/");
  if (slash < 0) return null;
  return name.slice(1, slash);
}

async function offerToInstall(query: string, best: ResolutionCandidate): Promise<string | null> {
  const ecosystem = bestEcosystem(best);
  if (!ecosystem) return null;
  try {
    const manifests = await detectManifests(process.cwd());
    if (manifests.length === 0) return null;
    const matching = manifests.find((m) => m.ecosystem === ecosystem);
    if (!matching) return null;
    const present = matching.deps.some(
      (d: LockedDep) => normaliseDepName(d.name) === normaliseDepName(query),
    );
    if (present) return null;
    return `> Not in your ${path.basename(matching.file)} — \`${installSuggestion(query, ecosystem)}\` to add it.`;
  } catch {
    return null;
  }
}

function bestEcosystem(c: ResolutionCandidate): Ecosystem | null {
  switch (c.source) {
    case "npm":
    case "pypi":
    case "crates":
    case "go":
    case "rubygems":
    case "packagist":
    case "hex":
      return c.source;
    default:
      return null;
  }
}

function normaliseDepName(s: string): string {
  return s.toLowerCase().replace(/[._-]/g, "");
}

function renderResolved(
  query: string,
  best: ResolutionCandidate,
  alts: ReadonlyArray<ResolutionCandidate>,
  fromCache: boolean,
  installSuggestionLine: string | null,
  manifestNote: string | null,
): string {
  const lines: string[] = [];
  const slug = `${best.owner}/${best.repo}`;
  const tag = fromCache ? " (cached)" : "";
  lines.push(`# Resolved "${query}" → ${slug}  (${sourceLabel(best.source)} match${tag})`);
  lines.push("");
  if (manifestNote) {
    lines.push(manifestNote);
    lines.push("");
  }
  lines.push(`repo:    ${slug}`);
  if (best.stars !== undefined) lines.push(`stars:   ${formatStars(best.stars)}`);
  if (best.defaultBranch) lines.push(`default: ${best.defaultBranch}`);
  if (best.latestTag) lines.push(`latest:  ${best.latestTag}`);
  if (best.description) lines.push(`about:   ${best.description}`);
  lines.push("");
  // Hint the planner: prefer the latest tag when the user asked about a
  // specific version, so it doesn't waste a round-trip on the default branch
  // first then re-resolve to a tag.
  const refHint = best.latestTag ? `@${best.latestTag}` : "";
  lines.push(`Use: \`list_docs("${slug}${refHint}")\`, then \`fetch_doc("${slug}${refHint}", "<path>")\``);
  if (installSuggestionLine) {
    lines.push("");
    lines.push(installSuggestionLine);
  }
  if (alts.length > 0) {
    lines.push("");
    lines.push("Alternative matches (lower confidence):");
    for (const a of alts) lines.push(`- ${a.owner}/${a.repo}${a.description ? ` — ${a.description}` : ""}`);
  }
  return lines.join("\n");
}

function renderAmbiguous(
  query: string,
  best: ResolutionCandidate,
  alts: ReadonlyArray<ResolutionCandidate>,
  installSuggestionLine: string | null,
  manifestNote: string | null,
): string {
  const lines: string[] = [];
  lines.push(`# Ambiguous: "${query}" matches multiple repos`);
  lines.push("");
  if (manifestNote) {
    lines.push(manifestNote);
    lines.push("");
  }
  lines.push(
    `Top: ${best.owner}/${best.repo}${best.stars !== undefined ? `  ★ ${formatStars(best.stars)}` : ""}`,
  );
  if (best.description) lines.push(`> ${best.description}`);
  if (alts.length > 0) {
    lines.push("");
    lines.push("Other candidates:");
    for (const a of alts) {
      const stars = a.stars !== undefined ? `  ★ ${formatStars(a.stars)}` : "";
      lines.push(`- ${a.owner}/${a.repo}${stars}${a.description ? ` — ${a.description}` : ""}`);
    }
  }
  lines.push("");
  lines.push(`If the top match looks right, use: \`list_docs("${best.owner}/${best.repo}")\``);
  lines.push("Otherwise call `resolve_repo` again with a more specific query.");
  if (installSuggestionLine) {
    lines.push("");
    lines.push(installSuggestionLine);
  }
  return lines.join("\n");
}

function renderNotFound(query: string): string {
  return [
    `# No repo found for "${query}"`,
    "",
    "Tried registry probes (npm/PyPI/crates/go/RubyGems/Packagist/Hex) and GitHub repo search; nothing matched.",
    "",
    "If you know the canonical path, call this tool again with `owner/repo` directly,",
    'or call `list_docs("owner/repo")` if you\'re sure of the slug.',
  ].join("\n");
}

const SOURCE_LABELS = {
  npm: "npm",
  pypi: "PyPI",
  crates: "crates.io",
  go: "pkg.go.dev",
  rubygems: "RubyGems",
  packagist: "Packagist",
  hex: "Hex.pm",
  "github-search": "GitHub search",
  literal: "literal",
  cache: "cached",
} as const satisfies Record<ResolutionCandidate["source"], string>;

function sourceLabel(s: ResolutionCandidate["source"]): string {
  return SOURCE_LABELS[s];
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function candidateToStructured(
  best: ResolutionCandidate,
  alts: ReadonlyArray<ResolutionCandidate>,
): ResolveRepoStructured {
  return {
    owner: best.owner,
    repo: best.repo,
    source: best.source,
    stars: best.stars ?? null,
    default_branch: best.defaultBranch ?? null,
    latest_tag: best.latestTag ?? null,
    confidence: best.confidence,
    alternatives: alts.map((a) => ({
      owner: a.owner,
      repo: a.repo,
      stars: a.stars ?? null,
    })),
  };
}
