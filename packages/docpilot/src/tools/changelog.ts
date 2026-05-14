import { z } from "zod";
import { fetchBlob } from "../fetch/strategy.js";
import { parseRepoSpec } from "../util/repoSpec.js";
import { fetchContextFrom, resolveSnapshot, type ToolContext } from "./context.js";

export const changelogInput = z.object({
  repo: z.string(),
  from_ref: z.string().optional(),
  to_ref: z.string().optional(),
});

export type ChangelogInput = z.infer<typeof changelogInput>;

const CANDIDATES = [
  "CHANGELOG.md",
  "CHANGELOG",
  "CHANGES.md",
  "HISTORY.md",
  "docs/CHANGELOG.md",
  "packages/CHANGELOG.md",
];

export function buildChangelogTool(ctx: ToolContext) {
  return async (input: ChangelogInput): Promise<string> => {
    const spec = parseRepoSpec(input.repo);
    const resolved = await resolveSnapshot(ctx, input.repo);
    const fctx = fetchContextFrom(ctx);
    let body = "";
    let foundPath = "";
    for (const candidate of CANDIDATES) {
      try {
        const r = await fetchBlob(
          fctx,
          spec.owner,
          spec.repo,
          resolved.snapshot.commitSha,
          candidate,
          {
            preferCdn: ctx.config.fetch.preferCdn,
            cdnEnabled: ctx.config.fetch.cdnEnabled,
          },
          resolved.forge,
        );
        body = Buffer.from(r.bytes).toString("utf8");
        foundPath = candidate;
        break;
      } catch {
        // try next
      }
    }
    if (!body) {
      return [
        `# Changelog for ${spec.owner}/${spec.repo}`,
        "",
        "_No CHANGELOG.md found at the usual paths._",
      ].join("\n");
    }

    const slice = sliceChangelog(body, input.from_ref, input.to_ref);
    return [
      `# Changelog: ${spec.owner}/${spec.repo}/${foundPath}`,
      `> Showing ${input.from_ref ?? "BEGIN"}…${input.to_ref ?? "END"} (heuristic match on version headings).`,
      "",
      slice || body.slice(0, 4000),
    ].join("\n");
  };
}

/**
 * Heuristic slicer: find headings that look like versions (`## v1.2.3`,
 * `## [1.2.3]`, `## 1.2.3`) and slice between them. Tolerates leading `v`.
 */
function sliceChangelog(text: string, fromRef: string | undefined, toRef: string | undefined): string {
  const lines = text.split(/\r?\n/);
  const versions: { line: number; version: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = /^(?:#{1,3})\s*\[?v?(\d+(?:\.\d+){0,2})(?:[^\]]*)\]?/.exec(line);
    if (m) versions.push({ line: i, version: m[1] ?? "" });
  }
  if (versions.length === 0) return "";

  const norm = (v: string | undefined): string | undefined => v?.replace(/^v/i, "").replace(/[\s)\]].*$/, "");
  const fromV = norm(fromRef);
  const toV = norm(toRef);

  let startIdx = 0;
  let endIdx = lines.length;
  if (toV) {
    const idx = versions.findIndex((v) => v.version === toV);
    if (idx >= 0) {
      const entry = versions[idx];
      if (entry) startIdx = entry.line;
    }
  }
  if (fromV) {
    const idx = versions.findIndex((v) => v.version === fromV);
    if (idx >= 0) {
      const entry = versions[idx];
      if (entry) endIdx = entry.line;
    }
  }
  if (startIdx >= endIdx) return "";
  return lines.slice(startIdx, endIdx).join("\n").trim();
}
