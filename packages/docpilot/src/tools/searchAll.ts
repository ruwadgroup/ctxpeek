import { z } from "zod";
import { fetchManyBlobs } from "../fetch/strategy.js";
import { classifyTree } from "../format/docsPaths.js";
import { renderSearchResults, type SearchHit } from "../format/searchMd.js";
import { detectManifests } from "../lockfile.js";
import { buildIndex, type DocsIndex, type IndexedDoc, parseMarkdown } from "../search/build.js";
import { loadIndex, saveIndex } from "../search/persist.js";
import { indexFile } from "../util/index.js";
import { fetchContextFrom, getTreeCached, resolveSnapshot, type ToolContext } from "./context.js";

export const searchAllInput = z.object({
  query: z.string().min(1),
  repos: z.array(z.string()).optional(),
  from_lockfile: z.boolean().default(false),
  limit_per_repo: z.number().int().positive().max(20).default(3),
  total_limit: z.number().int().positive().max(50).default(15),
  snippet_chars: z.number().int().positive().default(200),
});

export type SearchAllInput = z.infer<typeof searchAllInput>;

export function buildSearchAllTool(ctx: ToolContext) {
  return async (input: SearchAllInput): Promise<string> => {
    const t0 = Date.now();
    const repos = await resolveRepoList(ctx, input);
    if (repos.length === 0) {
      return [
        `# search_all: "${input.query}"`,
        "",
        '_No repos to search. Pass `repos: ["owner/repo", ...]` or `from_lockfile: true` from a project dir._',
      ].join("\n");
    }

    const all: Array<{ repoLabel: string; hit: SearchHit }> = [];
    let errors = 0;
    for (const spec of repos) {
      try {
        const resolved = await resolveSnapshot(ctx, spec);
        const idx = await loadOrBuildIndex(
          ctx,
          resolved.owner,
          resolved.repo,
          resolved.snapshot.commitSha,
          resolved.subpath,
          resolved.forge,
        );
        if (!idx) continue;
        const hits = idx.search(input.query, {
          combineWith: "OR",
          prefix: true,
          fuzzy: 0.2,
        });
        const label = `${resolved.owner}/${resolved.repo}${
          resolved.snapshot.requestedRef ? `@${resolved.snapshot.requestedRef}` : ""
        }`;
        for (const h of hits.slice(0, input.limit_per_repo)) {
          const preview = typeof h["bodyPreview"] === "string" ? (h["bodyPreview"] as string) : "";
          all.push({
            repoLabel: label,
            hit: {
              path: h["path"] as string,
              score: h.score,
              snippet: snippetAround(preview, input.query, input.snippet_chars),
            },
          });
        }
      } catch (err) {
        ctx.logger.warn("search_all: per-repo failure", {
          repo: spec,
          err: String(err),
        });
        errors += 1;
      }
    }

    all.sort((a, b) => b.hit.score - a.hit.score);
    const top = all.slice(0, input.total_limit);
    const elapsedMs = Date.now() - t0;

    if (top.length === 0) {
      return [
        `# search_all: "${input.query}"  (0 hits across ${repos.length} repo${
          repos.length === 1 ? "" : "s"
        })`,
        "",
        errors > 0 ? `> ${errors} repo${errors === 1 ? "" : "s"} could not be indexed.` : "",
        "_No matches. Tighten the query or list more repos._",
      ].join("\n");
    }

    const grouped = groupByRepo(top);
    const lines: string[] = [];
    lines.push(
      `# search_all: "${input.query}"  (${top.length} hits across ${grouped.size} repo${
        grouped.size === 1 ? "" : "s"
      }, ${(elapsedMs / 1000).toFixed(2)}s)`,
    );
    if (errors > 0) lines.push(`> ${errors} repo${errors === 1 ? "" : "s"} could not be indexed.`);
    lines.push("");
    for (const [label, hits] of grouped) {
      const md = renderSearchResults(input.query, hits, {
        repoLabel: label,
        elapsedMs,
      });
      const body = md.split("\n").slice(1).join("\n").trimStart();
      lines.push(`## ${label}`);
      lines.push("");
      lines.push(body);
      lines.push("");
    }
    return lines.join("\n").trimEnd();
  };
}

async function resolveRepoList(ctx: ToolContext, input: SearchAllInput): Promise<string[]> {
  const out = new Set<string>(input.repos ?? []);
  if (input.from_lockfile) {
    const manifests = await detectManifests(process.cwd());
    for (const m of manifests) {
      for (const dep of m.deps.slice(0, 50)) {
        const { resolve } = await import("../resolve/orchestrator.js");
        try {
          const r = await resolve({ rest: ctx.rest, http: ctx.http, logger: ctx.logger }, dep.name, {
            ecosystems: [m.ecosystem],
            githubSearchFallback: false,
            cacheFile: ctx.config.paths.resolutionsFile,
            perProbeTimeoutMs: 800,
          });
          if (r.best) {
            const ref = dep.version ? `@v${dep.version.replace(/^v/, "")}` : "";
            out.add(`${r.best.owner}/${r.best.repo}${ref}`);
          }
        } catch {
          // skip unresolvable deps quietly
        }
      }
    }
  }
  return [...out];
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
  const idx = buildIndex(indexed);
  try {
    await saveIndex(indexPath, idx);
  } catch {
    // best-effort persistence
  }
  return idx;
}

function snippetAround(preview: string, query: string, maxChars: number): string {
  if (!preview) return "";
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (tokens.length === 0) return preview.slice(0, maxChars);
  const lower = preview.toLowerCase();
  let best = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  if (best < 0) return preview.slice(0, maxChars);
  const start = Math.max(0, best - 40);
  return preview.slice(start, start + maxChars).trim();
}

function groupByRepo(
  entries: ReadonlyArray<{ repoLabel: string; hit: SearchHit }>,
): Map<string, SearchHit[]> {
  const out = new Map<string, SearchHit[]>();
  for (const e of entries) {
    const list = out.get(e.repoLabel) ?? [];
    list.push(e.hit);
    out.set(e.repoLabel, list);
  }
  return out;
}
