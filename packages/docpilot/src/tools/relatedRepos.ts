import { z } from "zod";
import { fetchBlob } from "../fetch/strategy.js";
import { fetchContextFrom, resolveSnapshot, type ToolContext } from "./context.js";

export const relatedReposInput = z.object({
  repo: z.string(),
  limit: z.number().int().positive().max(50).default(15),
});

export type RelatedReposInput = z.infer<typeof relatedReposInput>;

const README_CANDIDATES = ["README.md", "Readme.md", "readme.md", "README.mdx", "README.rst", "README"];
const LLMS_CANDIDATES = ["llms.txt", "llms-full.txt"];

const LINK_RE = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/gi;
const NOISE = new Set(["actions", "topics", "sponsors", "issues", "pulls", "marketplace"]);

export function buildRelatedReposTool(ctx: ToolContext) {
  return async (input: RelatedReposInput): Promise<string> => {
    const resolved = await resolveSnapshot(ctx, input.repo);
    const fctx = fetchContextFrom(ctx);
    const sources: string[] = [];
    for (const candidate of [...README_CANDIDATES, ...LLMS_CANDIDATES]) {
      try {
        const result = await fetchBlob(
          fctx,
          resolved.owner,
          resolved.repo,
          resolved.snapshot.commitSha,
          candidate,
          {
            preferCdn: ctx.config.fetch.preferCdn,
            cdnEnabled: ctx.config.fetch.cdnEnabled,
          },
          resolved.forge,
        );
        sources.push(Buffer.from(result.bytes).toString("utf8"));
      } catch {
        // not present — that's expected for most candidates
      }
    }
    if (sources.length === 0) {
      return [
        `# Related repos for ${resolved.owner}/${resolved.repo}`,
        "",
        "_README not found; nothing to scan._",
      ].join("\n");
    }

    const counts = new Map<
      string,
      {
        count: number;
        repo: string;
        owner: string;
      }
    >();
    for (const text of sources) {
      const seenInDoc = new Set<string>();
      for (const m of text.matchAll(LINK_RE)) {
        const owner = m[1];
        const rawRepo = m[2];
        if (!owner || !rawRepo) continue;
        const repo = rawRepo.replace(/\.git$/, "");
        if (NOISE.has(owner) || NOISE.has(repo)) continue;
        if (
          owner.toLowerCase() === resolved.owner.toLowerCase() &&
          repo.toLowerCase() === resolved.repo.toLowerCase()
        )
          continue;
        const key = `${owner}/${repo}`;
        if (seenInDoc.has(key)) continue;
        seenInDoc.add(key);
        const prev = counts.get(key);
        if (prev) counts.set(key, { count: prev.count + 1, owner, repo });
        else counts.set(key, { count: 1, owner, repo });
      }
    }

    const ranked = [...counts.values()]
      .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner))
      .slice(0, input.limit);

    if (ranked.length === 0) {
      return [
        `# Related repos for ${resolved.owner}/${resolved.repo}`,
        "",
        "_No peer github.com links found in README/llms.txt._",
      ].join("\n");
    }

    const lines = [
      `# Related repos for ${resolved.owner}/${resolved.repo}@${resolved.snapshot.requestedRef}`,
      "",
      `> Scraped from README/llms.txt links. Listed by mention count.`,
      "",
    ];
    for (const r of ranked) {
      lines.push(`- ${r.owner}/${r.repo}  · ${r.count} mention${r.count === 1 ? "" : "s"}`);
    }
    lines.push("", "Use `list_docs` or `resolve_repo` on any of these to follow up.");
    return lines.join("\n");
  };
}
