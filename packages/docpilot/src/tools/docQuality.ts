import { z } from "zod";
import { pickForge } from "../fetch/forgeClient.js";
import { isDocPath } from "../format/docsPaths.js";
import { formatBytes, formatRelativeAge } from "../util/tokens.js";
import { getTreeCached, resolveSnapshot, type ToolContext } from "./context.js";

export const docQualityInput = z.object({
  repo: z.string(),
});

export type DocQualityInput = z.infer<typeof docQualityInput>;

type NavSignal = {
  readonly framework: string;
  readonly path: string;
};

export function buildDocQualityTool(ctx: ToolContext) {
  return async (input: DocQualityInput): Promise<string> => {
    const resolved = await resolveSnapshot(ctx, input.repo);
    const tree = await getTreeCached(
      ctx,
      resolved.owner,
      resolved.repo,
      resolved.snapshot.commitSha,
      resolved.forge,
    );

    const pathSet = new Set(tree.entries.map((e) => e.path));
    const hasLlms = tree.entries.find((e) => e.path.toLowerCase() === "llms.txt");
    const hasLlmsFull = tree.entries.find((e) => e.path.toLowerCase() === "llms-full.txt");
    const hasReadme = tree.entries.find((e) => /^readme(?:\.(?:md|mdx|rst))?$/i.test(e.path));
    const navSignal = detectFrameworkNav(pathSet);

    const docFiles = tree.entries.filter((e) => e.type === "blob" && isDocPath(e.path));
    const total = docFiles.length;
    const sumSize = docFiles.reduce((a, b) => a + (b.size ?? 0), 0);
    const median = medianSize(docFiles.map((d) => d.size ?? 0));

    let lastCommitAge = "?";
    if (docFiles.length > 0) {
      const sampledPath = docFiles[0]?.path;
      if (sampledPath) {
        try {
          const client = pickForge(ctx.forges, resolved.forge);
          const info = await client.getLastCommitForPath(
            resolved.owner,
            resolved.repo,
            resolved.snapshot.commitSha,
            sampledPath,
          );
          if (info) lastCommitAge = formatRelativeAge(info.committedAt);
        } catch {
          // best-effort
        }
      }
    }

    const lines: string[] = [];
    lines.push(`# Docs quality: ${resolved.owner}/${resolved.repo}@${resolved.snapshot.requestedRef}`);
    lines.push("");
    lines.push(`llms.txt:        ${hasLlms ? `present (${formatBytes(hasLlms.size ?? 0)})` : "missing"}`);
    lines.push(
      `llms-full.txt:   ${hasLlmsFull ? `present (${formatBytes(hasLlmsFull.size ?? 0)})` : "missing"}`,
    );
    lines.push(
      `README:          ${
        hasReadme ? `present (${hasReadme.path}, ${formatBytes(hasReadme.size ?? 0)})` : "missing"
      }`,
    );
    lines.push(
      `Framework nav:   ${
        navSignal ? `${navSignal.framework} (${navSignal.path})` : "no structured nav detected"
      }`,
    );
    lines.push(
      `Doc files:       ${total} files, ${formatBytes(sumSize)} total, median ${formatBytes(median)}`,
    );
    lines.push(`Last docs touch: ${lastCommitAge}`);
    lines.push("");

    const score = computeScore({
      llms: Boolean(hasLlms),
      llmsFull: Boolean(hasLlmsFull),
      readme: Boolean(hasReadme),
      nav: Boolean(navSignal),
      total,
    });
    lines.push(`Score: ${score.label} (${score.value}/100)`);
    lines.push("");
    lines.push(score.notes.map((n) => `- ${n}`).join("\n"));
    return lines.join("\n");
  };
}

function detectFrameworkNav(paths: Set<string>): NavSignal | null {
  const checks: Array<[string, string]> = [
    ["mint.json", "Mintlify"],
    ["docusaurus.config.ts", "Docusaurus"],
    ["docusaurus.config.js", "Docusaurus"],
    ["docs/.vitepress/config.ts", "VitePress"],
    ["docs/.vitepress/config.mjs", "VitePress"],
    ["docs/.vitepress/config.js", "VitePress"],
    ["docs/sidebars.js", "Docusaurus"],
    ["docs/sidebars.ts", "Docusaurus"],
    ["fern/fern.config.json", "Fern"],
    ["nextra.config.js", "Nextra"],
    ["theme.config.tsx", "Nextra"],
    ["theme.config.jsx", "Nextra"],
  ];
  for (const [path, framework] of checks) {
    if (paths.has(path)) return { framework, path };
    for (const p of paths) {
      if (p.toLowerCase().endsWith(`/${path.toLowerCase()}`)) return { framework, path: p };
    }
  }
  return null;
}

function medianSize(sizes: ReadonlyArray<number>): number {
  if (sizes.length === 0) return 0;
  const sorted = [...sizes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
  return sorted[mid] ?? 0;
}

function computeScore(facts: {
  llms: boolean;
  llmsFull: boolean;
  readme: boolean;
  nav: boolean;
  total: number;
}): {
  value: number;
  label: string;
  notes: string[];
} {
  const notes: string[] = [];
  let score = 0;
  if (facts.readme) score += 20;
  else notes.push("No README at the repo root — fall back on tree-level browsing.");
  if (facts.llms) {
    score += 30;
    notes.push("llms.txt present — `search_docs` will boost hits inside it.");
  } else {
    notes.push("No llms.txt — fine, but the maintainer hasn't curated a model entry point.");
  }
  if (facts.llmsFull) {
    score += 15;
    notes.push("llms-full.txt present — single-shot fetch may be sufficient for narrow questions.");
  }
  if (facts.nav) {
    score += 20;
    notes.push("Structured docs framework detected.");
  }
  if (facts.total >= 10) score += 15;
  else if (facts.total >= 3) score += 7;
  else notes.push(`Only ${facts.total} doc-shaped files in this tree; consider \`include_examples: true\`.`);
  if (score === 0) notes.push("Treat this repo's docs cautiously — better to ask the user for context.");
  const label = score >= 75 ? "excellent" : score >= 50 ? "good" : score >= 25 ? "thin" : "sparse";
  return { value: score, label, notes };
}
