import { z } from "zod";
import { fetchManyBlobs } from "../fetch/strategy.js";
import { classifyTree } from "../format/docsPaths.js";
import { renderSearchResults, type SearchHit } from "../format/searchMd.js";
import { buildIndex, type DocsIndex, type IndexedDoc, parseMarkdown } from "../search/build.js";
import { loadIndex, saveIndex } from "../search/persist.js";
import { indexFile } from "../util/index.js";
import { fetchContextFrom, getTreeCached, resolveSnapshot, type ToolContext } from "./context.js";

export const searchDocsInput = z.object({
  repo: z.string(),
  query: z.string().min(1),
  limit: z.number().int().positive().max(100).default(10),
  fields: z.array(z.enum(["title", "headings", "body"])).optional(),
  snippet_chars: z.number().int().positive().default(240),
});

export type SearchDocsInput = z.infer<typeof searchDocsInput>;

export function buildSearchDocsTool(ctx: ToolContext) {
  return async (input: SearchDocsInput): Promise<string> => {
    const t0 = Date.now();
    const resolved = await resolveSnapshot(ctx, input.repo);
    const index = await loadOrBuildIndex(
      ctx,
      resolved.owner,
      resolved.repo,
      resolved.snapshot.commitSha,
      resolved.subpath,
      resolved.forge,
    );
    if (!index) {
      return [
        `# Search: "${input.query}" in ${resolved.owner}/${resolved.repo}`,
        "",
        "_No indexable docs files were found. Try `list_docs` to inspect the tree._",
      ].join("\n");
    }
    const found = index.search(input.query, {
      fields: input.fields ? [...input.fields] : ["title", "headings", "body", "path"],
      combineWith: "OR",
      prefix: true,
      fuzzy: 0.2,
    });
    const hits: SearchHit[] = found.slice(0, input.limit).map((r) => {
      const preview = typeof r.bodyPreview === "string" ? (r.bodyPreview as string) : "";
      return {
        path: r.path as string,
        score: r.score,
        snippet: snippetAround(preview, input.query, input.snippet_chars),
      };
    });
    return renderSearchResults(input.query, hits, {
      repoLabel: `${resolved.owner}/${resolved.repo}${
        resolved.snapshot.requestedRef ? `@${resolved.snapshot.requestedRef}` : ""
      }`,
      elapsedMs: Date.now() - t0,
    });
  };
}

async function loadOrBuildIndex(
  ctx: ToolContext,
  owner: string,
  repo: string,
  sha: string,
  subpath: string | undefined,
  forge: "github" | "gitlab" | "bitbucket" = "github",
): Promise<DocsIndex | null> {
  const indexPath = indexFile(ctx.config.paths.indexes, owner, repo, `${forge}-${sha}`);
  const cached = await loadIndex(indexPath);
  if (cached) return cached;

  const tree = await getTreeCached(ctx, owner, repo, sha, forge);
  const opts: { subpath?: string } = {};
  if (subpath) opts.subpath = subpath;
  const docs = classifyTree(tree.entries, opts).filter((e) => e.size > 0 && e.size < 1_000_000);

  if (docs.length === 0) return null;

  const fctx = fetchContextFrom(ctx);
  const paths = docs.map((d) => d.path);
  const results = await fetchManyBlobs(
    fctx,
    owner,
    repo,
    sha,
    paths,
    {
      preferCdn: ctx.config.fetch.preferCdn,
      cdnEnabled: ctx.config.fetch.cdnEnabled,
      graphqlThreshold: 4,
    },
    forge,
  );

  const indexed: IndexedDoc[] = [];
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const result = results[i];
    if (!doc || !result) continue;
    const text = Buffer.from(result.bytes).toString("utf8");
    const parsed = parseMarkdown(doc.path, text);
    indexed.push({
      id: doc.path,
      path: doc.path,
      title: parsed.title,
      headings: parsed.headings,
      body: parsed.body,
      bodyPreview: parsed.body.slice(0, 1200),
      size: doc.size,
      lastModified: tree.fetchedAt,
    });
  }

  const index = buildIndex(indexed);
  try {
    await saveIndex(indexPath, index);
  } catch (err) {
    ctx.logger.warn("search: failed to persist index", { err: String(err) });
  }
  return index;
}

function snippetAround(preview: string, query: string, maxChars: number): string {
  if (!preview) return "";
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (tokens.length === 0) return preview.slice(0, maxChars);
  const lower = preview.toLowerCase();
  let bestIdx = -1;
  for (const t of tokens) {
    const idx = lower.indexOf(t);
    if (idx >= 0 && (bestIdx < 0 || idx < bestIdx)) bestIdx = idx;
  }
  if (bestIdx < 0) return preview.slice(0, maxChars);
  const start = Math.max(0, bestIdx - 40);
  return preview.slice(start, start + maxChars).trim();
}
