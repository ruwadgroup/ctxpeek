import * as path from "node:path";
import { z } from "zod";
import type { Ecosystem } from "../config.js";
import { type ResolutionCandidate, resolve } from "../resolve/orchestrator.js";
import type { ToolContext } from "./context.js";
import {
  findConfiguredPackageMapping,
  findProjectManifestMatch,
  offerProjectInstall,
} from "./projectContext.js";

export const resolveRepoInput = z.object({
  query: z.string().min(1),
  ecosystem: z.enum(["npm", "pypi", "crates", "go", "rubygems", "packagist", "hex"]).optional(),
  force_refresh: z.boolean().optional(),
});

export type ResolveRepoInput = z.infer<typeof resolveRepoInput>;

export type ResolveRepoStructured = {
  readonly forge: string;
  readonly owner: string;
  readonly repo: string;
  readonly repo_spec: string;
  readonly subpath: string | null;
  readonly source: string;
  readonly stars: number | null;
  readonly default_branch: string | null;
  readonly latest_tag: string | null;
  readonly confidence: number;
  readonly alternatives: ReadonlyArray<{
    owner: string;
    repo: string;
    repo_spec: string;
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

    // Project-aware preflight: explicit package mappings win first, then
    // local manifests/workspaces can steer the resolver to the package the
    // user actually imports instead of a same-named public package.
    const configHit = findConfiguredPackageMapping(ctx.config, input.query, input.ecosystem);
    const manifestHit =
      input.ecosystem || configHit ? null : await findProjectManifestMatch(input.query).catch(() => null);
    const resolveQuery = configHit?.repoSpec ?? manifestHit?.repoSpec ?? manifestHit?.depName ?? input.query;
    const resolveEcosystems = configHit?.ecosystem
      ? [configHit.ecosystem]
      : manifestHit
        ? [manifestHit.ecosystem]
        : defaultEcosystems;

    const raw = await resolve(
      { rest: ctx.rest, forges: ctx.forges, graphql: ctx.graphql, http: ctx.http, logger: ctx.logger },
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
    const result =
      raw.best.latestTag || raw.best.forge !== "github"
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
    const matchNote = configHit
      ? `> Matched **${configHit.depName}** from ctxpeek package mappings before local manifests and public registries.`
      : manifestHit
        ? `> Matched **${manifestHit.depName}** from your ${path.basename(manifestHit.manifestFile)} (scope/name alias of "${input.query}").`
        : null;

    if (result.ambiguous) {
      return {
        markdown: renderAmbiguous(
          input.query,
          result.best,
          result.alternatives,
          installSuggestionLine,
          matchNote,
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
        matchNote,
      ),
      structured: candidateToStructured(result.best, result.alternatives),
    };
  };
}

async function offerToInstall(query: string, best: ResolutionCandidate): Promise<string | null> {
  const ecosystem = bestEcosystem(best);
  if (!ecosystem) return null;
  return offerProjectInstall(query, ecosystem);
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

function renderResolved(
  query: string,
  best: ResolutionCandidate,
  alts: ReadonlyArray<ResolutionCandidate>,
  fromCache: boolean,
  installSuggestionLine: string | null,
  manifestNote: string | null,
): string {
  const lines: string[] = [];
  const slug = repoSpec(best);
  const tag = fromCache ? " (cached)" : "";
  lines.push(`# Resolved "${query}" → ${slug}  (${sourceLabel(best.source)} match${tag})`);
  lines.push("");
  if (manifestNote) {
    lines.push(manifestNote);
    lines.push("");
  }
  lines.push(`repo:    ${slug}`);
  if (best.subpath) lines.push(`package: ${best.subpath}`);
  if (best.stars !== undefined) lines.push(`stars:   ${formatStars(best.stars)}`);
  if (best.defaultBranch) lines.push(`default: ${best.defaultBranch}`);
  if (best.latestTag) lines.push(`latest:  ${best.latestTag}`);
  if (best.description) lines.push(`about:   ${best.description}`);
  lines.push("");
  // Hint the planner: prefer the latest tag when the user asked about a
  // specific version, so it doesn't waste a round-trip on the default branch
  // first then re-resolve to a tag.
  const useSpec = repoSpec(best, best.ref ?? best.latestTag);
  lines.push(`Use: \`list_docs("${useSpec}")\`, then \`fetch_doc("${useSpec}", "<path>")\``);
  if (installSuggestionLine) {
    lines.push("");
    lines.push(installSuggestionLine);
  }
  if (alts.length > 0) {
    lines.push("");
    lines.push("Alternative matches (lower confidence):");
    for (const a of alts) lines.push(`- ${repoSpec(a)}${a.description ? ` — ${a.description}` : ""}`);
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
  lines.push(`Top: ${repoSpec(best)}${best.stars !== undefined ? `  ★ ${formatStars(best.stars)}` : ""}`);
  if (best.subpath) lines.push(`package: ${best.subpath}`);
  if (best.description) lines.push(`> ${best.description}`);
  if (alts.length > 0) {
    lines.push("");
    lines.push("Other candidates:");
    for (const a of alts) {
      const stars = a.stars !== undefined ? `  ★ ${formatStars(a.stars)}` : "";
      lines.push(`- ${repoSpec(a)}${stars}${a.description ? ` — ${a.description}` : ""}`);
    }
  }
  lines.push("");
  lines.push(`If the top match looks right, use: \`list_docs("${repoSpec(best)}")\``);
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

function repoSpec(c: ResolutionCandidate, ref?: string | null): string {
  const slug = `${c.owner}/${c.repo}`;
  const prefix = c.forge === "github" ? "" : `${c.forge}:`;
  const resolvedRef = ref ?? c.ref;
  const refPart = resolvedRef ? `@${resolvedRef}` : "";
  const subpath = c.subpath ? `#${c.subpath}` : "";
  return `${prefix}${slug}${refPart}${subpath}`;
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
    forge: best.forge,
    owner: best.owner,
    repo: best.repo,
    repo_spec: repoSpec(best),
    subpath: best.subpath ?? null,
    source: best.source,
    stars: best.stars ?? null,
    default_branch: best.defaultBranch ?? null,
    latest_tag: best.latestTag ?? null,
    confidence: best.confidence,
    alternatives: alts.map((a) => ({
      owner: a.owner,
      repo: a.repo,
      repo_spec: repoSpec(a),
      stars: a.stars ?? null,
    })),
  };
}
