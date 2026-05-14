import * as path from "node:path";
import { z } from "zod";
import type { Ecosystem } from "../config.js";
import { detectManifests, installSuggestion, type LockedDep } from "../lockfile.js";
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
    const ecosystems = input.ecosystem ? [input.ecosystem] : ctx.config.resolve.ecosystems;
    const result = await resolve({ rest: ctx.rest, http: ctx.http, logger: ctx.logger }, input.query, {
      ecosystems,
      githubSearchFallback: ctx.config.resolve.githubSearchFallback,
      cacheFile: ctx.config.paths.resolutionsFile,
      ...(input.force_refresh ? { forceRefresh: true } : {}),
    });

    if (!result.best) {
      return {
        markdown: renderNotFound(input.query),
        structured: null,
      };
    }

    const installSuggestionLine = await offerToInstall(input.query, result.best);

    if (result.ambiguous) {
      return {
        markdown: renderAmbiguous(input.query, result.best, result.alternatives, installSuggestionLine),
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
      ),
      structured: candidateToStructured(result.best, result.alternatives),
    };
  };
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
): string {
  const lines: string[] = [];
  const slug = `${best.owner}/${best.repo}`;
  const tag = fromCache ? " (cached)" : "";
  lines.push(`# Resolved "${query}" → ${slug}  (${sourceLabel(best.source)} match${tag})`);
  lines.push("");
  lines.push(`repo:    ${slug}`);
  if (best.stars !== undefined) lines.push(`stars:   ${formatStars(best.stars)}`);
  if (best.defaultBranch) lines.push(`default: ${best.defaultBranch}`);
  if (best.description) lines.push(`about:   ${best.description}`);
  lines.push("");
  lines.push(`Use: \`list_docs("${slug}")\``);
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
): string {
  const lines: string[] = [];
  lines.push(`# Ambiguous: "${query}" matches multiple repos`);
  lines.push("");
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
    "Tried registry probes (npm/PyPI/crates/go/rubygems) and GitHub repo search; nothing matched.",
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
    confidence: best.confidence,
    alternatives: alts.map((a) => ({
      owner: a.owner,
      repo: a.repo,
      stars: a.stars ?? null,
    })),
  };
}
