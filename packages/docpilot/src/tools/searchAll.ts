import { z } from "zod";
import { classifyTree } from "../format/docsPaths.js";
import { renderSearchResults, type SearchHit } from "../format/searchMd.js";
import { detectManifests } from "../lockfile.js";
import { scorePathAgainstQuery, synthesizePathSnippet, tokenizeQuery } from "../search/pathSearch.js";
import { getTreeCached, resolveSnapshot, type ToolContext } from "./context.js";

export const searchAllInput = z.object({
  query: z.string().min(1),
  repos: z.array(z.string()).optional(),
  from_lockfile: z.boolean().default(false),
  limit_per_repo: z.number().int().positive().max(20).default(3),
  total_limit: z.number().int().positive().max(50).default(15),
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

    const queryTokens = tokenizeQuery(input.query);
    if (queryTokens.length === 0) {
      return [`# search_all: "${input.query}"`, "", "_Query has no searchable tokens (need ≥2 chars)._"].join(
        "\n",
      );
    }

    const all: Array<{ repoLabel: string; hit: SearchHit }> = [];
    let errors = 0;
    for (const spec of repos) {
      try {
        const resolved = await resolveSnapshot(ctx, spec);
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

        const scored = docs
          .map((d) => ({ path: d.path, score: scorePathAgainstQuery(d.path, queryTokens) }))
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, input.limit_per_repo);

        const label = `${resolved.owner}/${resolved.repo}${
          resolved.snapshot.requestedRef ? `@${resolved.snapshot.requestedRef}` : ""
        }`;
        for (const s of scored) {
          all.push({
            repoLabel: label,
            hit: { path: s.path, score: s.score, snippet: synthesizePathSnippet(s.path) },
          });
        }
      } catch (err) {
        ctx.logger.warn("search_all: per-repo failure", { repo: spec, err: String(err) });
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
        errors > 0 ? `> ${errors} repo${errors === 1 ? "" : "s"} could not be searched.` : "",
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
    if (errors > 0) lines.push(`> ${errors} repo${errors === 1 ? "" : "s"} could not be searched.`);
    lines.push("");
    for (const [label, hits] of grouped) {
      const md = renderSearchResults(input.query, hits, { repoLabel: label, elapsedMs });
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
  if (!input.from_lockfile) return [...out];

  const manifests = await detectManifests(process.cwd());
  const tasks: Array<{
    dep: import("../lockfile.js").LockedDep;
    ecosystem: import("../config.js").Ecosystem;
  }> = [];
  for (const m of manifests) {
    for (const dep of m.deps.slice(0, 50)) tasks.push({ dep, ecosystem: m.ecosystem });
  }
  if (tasks.length === 0) return [...out];

  const { resolve } = await import("../resolve/orchestrator.js");
  // Parallel resolves: the getRepo dedup + 7-day repoMeta cache mean two
  // concurrent resolves of the same owner/repo share one network call,
  // and warm sessions hit the cache before going to the network at all.
  const resolved = await Promise.all(
    tasks.map(async (t) => {
      try {
        const r = await resolve(
          { rest: ctx.rest, graphql: ctx.graphql, http: ctx.http, logger: ctx.logger },
          t.dep.name,
          {
            ecosystems: [t.ecosystem],
            githubSearchFallback: false,
            cacheFile: ctx.config.paths.resolutionsFile,
            perProbeTimeoutMs: 800,
          },
        );
        if (!r.best) return null;
        const ref = t.dep.version ? `@v${t.dep.version.replace(/^v/, "")}` : "";
        return { spec: `${r.best.owner}/${r.best.repo}${ref}`, owner: r.best.owner, repo: r.best.repo };
      } catch {
        return null;
      }
    }),
  );

  // Pre-warm the repoMeta cache in one GraphQL roundtrip when we have a
  // token. Subsequent `resolveSnapshot` calls inside the per-repo loop
  // will all hit the cache instead of issuing per-repo getRepo calls.
  if (ctx.graphql) {
    const uniq = new Map<string, { owner: string; repo: string }>();
    for (const r of resolved) {
      if (!r) continue;
      const key = `${r.owner.toLowerCase()}/${r.repo.toLowerCase()}`;
      if (!uniq.has(key)) uniq.set(key, { owner: r.owner, repo: r.repo });
    }
    const pairs = [...uniq.values()];
    if (pairs.length > 0) {
      const metas = await ctx.graphql.batchGetRepoMetadata(pairs);
      await Promise.all(
        metas.map(async (m) => {
          if (!m) return;
          await ctx.repoMeta.put({
            forge: "github",
            owner: m.owner,
            repo: m.repo,
            defaultBranch: m.defaultBranch,
            stars: m.stars,
            description: m.description,
            latestTag: m.latestTag,
            latestTagFetchedAt: new Date().toISOString(),
            fetchedAt: new Date().toISOString(),
          });
        }),
      );
    }
  }

  for (const r of resolved) if (r) out.add(r.spec);
  return [...out];
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
