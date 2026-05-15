// Recipes — shareable bundles of pre-pinned repos.
import * as fs from "node:fs/promises";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";
import { classifyTree } from "./format/docsPaths.js";
import { getTreeCached, resolveSnapshot, type ToolContext } from "./tools/context.js";

const RecipeSchema = z.object({
  repo: z
    .array(
      z.object({
        spec: z.string(),
        alias: z.string().optional(),
      }),
    )
    .default([]),
});

export type Recipe = {
  readonly repos: ReadonlyArray<{ spec: string; alias: string | undefined }>;
};

export type RecipeInstallResult = {
  readonly repo: string;
  readonly status: "ok" | "fail";
  readonly filesPrewarmed?: number;
  readonly error?: string;
};

export async function loadRecipe(filePath: string): Promise<Recipe> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = RecipeSchema.parse(parseToml(raw));
  return {
    repos: parsed.repo.map((r) => ({ spec: r.spec, alias: r.alias })),
  };
}

export async function installRecipe(
  ctx: ToolContext,
  recipe: Recipe,
): Promise<ReadonlyArray<RecipeInstallResult>> {
  const out: RecipeInstallResult[] = [];
  for (const r of recipe.repos) {
    try {
      const resolved = await resolveSnapshot(ctx, r.spec);
      const tree = await getTreeCached(
        ctx,
        resolved.owner,
        resolved.repo,
        resolved.snapshot.commitSha,
        resolved.forge,
      );
      const opts: { subpath?: string } = {};
      if (resolved.subpath) opts.subpath = resolved.subpath;
      const docs = classifyTree(tree.entries, opts);
      ctx.logger.info("recipe: prewarm tree", {
        spec: r.spec,
        files: docs.length,
      });
      out.push({ repo: r.spec, status: "ok", filesPrewarmed: docs.length });
    } catch (err) {
      out.push({ repo: r.spec, status: "fail", error: String(err) });
    }
  }
  return out;
}

export function renderRecipeReport(results: ReadonlyArray<RecipeInstallResult>): string {
  const lines: string[] = ["# ctxpeek recipe install", ""];
  for (const r of results) {
    if (r.status === "ok") {
      lines.push(`✓ ${r.repo} — ${r.filesPrewarmed ?? 0} docs files staged`);
    } else {
      lines.push(`✗ ${r.repo} — ${r.error ?? "unknown error"}`);
    }
  }
  return lines.join("\n");
}
