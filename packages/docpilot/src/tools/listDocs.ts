import { z } from "zod";
import { pickForge } from "../fetch/forgeClient.js";
import { classifyTree } from "../format/docsPaths.js";
import { approxTokens } from "../format/frontmatter.js";
import { renderTree, type TreeEntry } from "../format/tree.js";
import type { ToolContext } from "./context.js";
import { getTreeCached, resolveSnapshot } from "./context.js";

export const listDocsInput = z.object({
  repo: z.string(),
  deep: z.boolean().optional(),
  include_examples: z.boolean().optional(),
  max_files: z.number().int().positive().optional(),
  /**
   * Filter to files touched since this ISO date (e.g. "2025-04-01").
   * Useful for "what docs changed since the model's training cutoff?".
   * Per design doc §14 Tier A #10.
   */
  since: z.string().optional(),
});

export type ListDocsInput = z.infer<typeof listDocsInput>;

const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

export function buildListDocsTool(ctx: ToolContext) {
  return async (input: ListDocsInput): Promise<string> => {
    const resolved = await resolveSnapshot(ctx, input.repo);
    const tree = await getTreeCached(
      ctx,
      resolved.owner,
      resolved.repo,
      resolved.snapshot.commitSha,
      resolved.forge,
    );

    const opts: { includeExamples?: boolean; subpath?: string } = {};
    if (input.include_examples) opts.includeExamples = true;
    if (resolved.subpath) opts.subpath = resolved.subpath;
    const filteredAll = classifyTree(tree.entries, opts);
    const filtered = input.max_files ? filteredAll.slice(0, input.max_files) : filteredAll;

    const highSignalPaths = detectHighSignal(filtered.map((e) => e.path));
    const recentMap = await detectRecent(
      ctx,
      resolved.owner,
      resolved.repo,
      resolved.snapshot.commitSha,
      filtered.map((e) => e.path),
      input.since,
      resolved.forge,
    );

    const sinceMs = input.since ? Date.parse(input.since) : null;
    const includeAll = !sinceMs;
    let entries: TreeEntry[] = filtered.map((e) => ({
      path: e.path,
      size: e.size ?? 0,
      highSignal: highSignalPaths.has(e.path),
      highlightedInNav: false,
      recentlyChanged: recentMap.get(e.path) === true,
    }));
    if (sinceMs && !includeAll) {
      entries = entries.filter((e) => recentMap.get(e.path) === true);
    }

    const tokenSum = entries.reduce((a, b) => a + approxTokens("X".repeat(b.size)), 0);
    const notes: string[] = [];
    if (tree.truncated)
      notes.push("GitHub returned a truncated tree (>100k entries). Use `#subpath` to scope.");
    if (input.max_files && filteredAll.length > input.max_files) {
      notes.push(
        `Showing first ${input.max_files} of ${filteredAll.length} matching files (max_files limit).`,
      );
    }

    return renderTree(entries, {
      repoLabel: `${resolved.owner}/${resolved.repo}`,
      resolvedRef: resolved.snapshot.requestedRef,
      commitSha: resolved.snapshot.commitSha,
      tokensApprox: tokenSum,
      truncated: tree.truncated,
      subpath: resolved.subpath,
      notes,
    });
  };
}

function detectHighSignal(paths: ReadonlyArray<string>): Set<string> {
  const out = new Set<string>();
  for (const p of paths) {
    const lower = p.toLowerCase();
    const base = lower.split("/").pop() ?? "";
    if (lower === "readme.md" || lower === "readme.mdx" || lower === "readme.rst") out.add(p);
    if (base === "llms.txt" || base === "llms-full.txt") out.add(p);
    if (lower.endsWith("/index.md") || lower.endsWith("/index.mdx")) out.add(p);
    if (
      lower.includes("getting-started") ||
      lower.includes("getting_started") ||
      lower.includes("quickstart")
    )
      out.add(p);
  }
  return out;
}

async function detectRecent(
  ctx: ToolContext,
  owner: string,
  repo: string,
  sha: string,
  paths: ReadonlyArray<string>,
  since: string | undefined,
  forge: "github" | "gitlab" | "bitbucket" = "github",
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  const sinceMs = since ? Date.parse(since) : null;
  const client = pickForge(ctx.forges, forge);
  // When `since` is set, probe every doc path (the model explicitly asked
  // for changed-since filtering). Otherwise sample the first 12 to keep
  // rate-limit cost low and just decorate badges.
  const sampled = sinceMs ? paths : paths.slice(0, 12);
  await Promise.all(
    sampled.map(async (p) => {
      try {
        const info = await client.getLastCommitForPath(owner, repo, sha, p);
        if (!info) return;
        const committed = Date.parse(info.committedAt);
        if (sinceMs !== null) {
          out.set(p, committed >= sinceMs);
        } else {
          const age = Date.now() - committed;
          out.set(p, age < RECENT_MS);
        }
      } catch {
        // best-effort; freshness badges are not required for correctness
      }
    }),
  );
  return out;
}
