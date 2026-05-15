import { z } from "zod";
import { classifyTree } from "../format/docsPaths.js";
import { renderSearchResults, type SearchHit } from "../format/searchMd.js";
import { scorePathAgainstQuery, synthesizePathSnippet, tokenizeQuery } from "../search/pathSearch.js";
import { getTreeCached, resolveSnapshot, type ToolContext } from "./context.js";

export const searchDocsInput = z.object({
  repo: z.string(),
  query: z.string().min(1),
  limit: z.number().int().positive().max(100).default(10),
});

export type SearchDocsInput = z.infer<typeof searchDocsInput>;

export function buildSearchDocsTool(ctx: ToolContext) {
  return async (input: SearchDocsInput): Promise<string> => {
    const t0 = Date.now();
    const resolved = await resolveSnapshot(ctx, input.repo);
    const repoLabel = `${resolved.owner}/${resolved.repo}${
      resolved.snapshot.requestedRef ? `@${resolved.snapshot.requestedRef}` : ""
    }`;

    const tree = await getTreeCached(
      ctx,
      resolved.owner,
      resolved.repo,
      resolved.snapshot.commitSha,
      resolved.forge,
    );
    const opts: { subpath?: string } = {};
    if (resolved.subpath) opts.subpath = resolved.subpath;
    const docs = classifyTree(tree.entries, opts).filter((e) => e.size > 0);

    if (docs.length === 0) {
      return [
        `# Search: "${input.query}" in ${repoLabel}`,
        "",
        "_No doc files in the tree. Try `list_docs` for the full tree._",
      ].join("\n");
    }

    const queryTokens = tokenizeQuery(input.query);
    if (queryTokens.length === 0) {
      return [
        `# Search: "${input.query}" in ${repoLabel}`,
        "",
        "_Query has no searchable tokens (need ≥2 chars)._",
      ].join("\n");
    }

    const scored = docs
      .map((d) => ({ path: d.path, score: scorePathAgainstQuery(d.path, queryTokens) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit);

    const hits: SearchHit[] = scored.map((s) => ({
      path: s.path,
      score: s.score,
      snippet: synthesizePathSnippet(s.path),
    }));

    return renderSearchResults(input.query, hits, {
      repoLabel,
      elapsedMs: Date.now() - t0,
    });
  };
}
