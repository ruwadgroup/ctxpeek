import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { formatBytes } from "../util/tokens.js";
import type { ToolContext } from "./context.js";

export const cacheStatusInput = z.object({
  repo: z.string().optional(),
});

export type CacheStatusInput = z.infer<typeof cacheStatusInput>;

export function buildCacheStatusTool(ctx: ToolContext) {
  return async (input: CacheStatusInput): Promise<string> => {
    const blobsBytes = await ctx.blobs.size();
    const refsBytes = await dirSize(ctx.config.paths.refs);

    const lines: string[] = [];
    lines.push(`# ctxpeek cache`);
    lines.push("");
    lines.push(`Location:     ${ctx.config.paths.cache}`);
    lines.push(`Blobs:        ${formatBytes(blobsBytes)}`);
    lines.push(`Refs/trees:   ${formatBytes(refsBytes)}`);
    lines.push(
      `Cap:          ${formatBytes(ctx.config.cache.maxSizeBytes)} (gc_days=${ctx.config.cache.gcDays})`,
    );
    lines.push("");

    if (input.repo) {
      const repoLines = await describeRepoCache(ctx, input.repo);
      lines.push(...repoLines);
    } else {
      lines.push('Call with `{ repo: "owner/repo" }` for per-repo breakdown.');
    }
    return lines.join("\n");
  };
}

async function describeRepoCache(ctx: ToolContext, repoSpec: string): Promise<string[]> {
  const [owner, repo] = repoSpec.split("@")[0]?.split("#")[0]?.split("/") ?? [];
  if (!owner || !repo) return [`Could not parse "${repoSpec}".`];
  const refsDir = path.join(ctx.config.paths.refs, `${owner.toLowerCase()}--${repo.toLowerCase()}`);
  const out: string[] = [];
  try {
    const entries = await fs.readdir(refsDir, { withFileTypes: true });
    out.push(`## ${owner}/${repo}`);
    out.push("");
    for (const e of entries) {
      if (!e.isFile()) continue;
      const fp = path.join(refsDir, e.name);
      const stat = await fs.stat(fp);
      out.push(`- ${e.name}  (${formatBytes(stat.size)}, mtime ${stat.mtime.toISOString()})`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      out.push(`No cached refs for ${owner}/${repo}.`);
    } else {
      out.push(`Error reading cache: ${String(err)}`);
    }
  }
  return out;
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) total += await dirSize(fp);
      else if (e.isFile()) {
        const stat = await fs.stat(fp);
        total += stat.size;
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }
  return total;
}
