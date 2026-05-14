import { z } from "zod";
import { parseRepoSpec } from "../util/repoSpec.js";
import { formatRelativeAge } from "../util/tokens.js";
import type { ToolContext } from "./context.js";

export const getIssuesInput = z.object({
  repo: z.string(),
  query: z.string().min(1),
  state: z.enum(["open", "closed", "all"]).default("open"),
  type: z.enum(["issue", "pr", "both"]).default("both"),
  limit: z.number().int().positive().max(20).default(5),
});

export type GetIssuesInput = z.infer<typeof getIssuesInput>;

export function buildGetIssuesTool(ctx: ToolContext) {
  return async (input: GetIssuesInput): Promise<string> => {
    const spec = parseRepoSpec(input.repo);
    const opts: {
      state?: "open" | "closed" | "all";
      type?: "issue" | "pr" | "both";
      perPage?: number;
    } = {
      perPage: input.limit,
    };
    if (input.state) opts.state = input.state;
    if (input.type) opts.type = input.type;
    const hits = await ctx.rest.searchIssues(spec.owner, spec.repo, input.query, opts);
    const lines: string[] = [];
    lines.push(
      `# Issues / PRs in ${spec.owner}/${spec.repo} matching "${input.query}"  (${hits.length} hit${
        hits.length === 1 ? "" : "s"
      })`,
    );
    lines.push("");
    if (hits.length === 0) {
      lines.push('_No matches. Tighten the query or set `state: "all"` to include closed items._');
      return lines.join("\n");
    }
    for (const h of hits) {
      const kind = h.isPullRequest ? "PR" : "issue";
      const ageStr = formatRelativeAge(h.updatedAt);
      lines.push(`- #${h.number} ${kind} · ${h.state} · updated ${ageStr} · @${h.author}`);
      lines.push(`  ${h.title}`);
      if (h.bodyPreview) lines.push(`  > ${truncate(h.bodyPreview)}`);
      lines.push(`  ${h.url}`);
      lines.push("");
    }
    return lines.join("\n").trimEnd();
  };
}

function truncate(s: string): string {
  const single = s.replace(/\s+/g, " ").trim();
  if (single.length <= 200) return single;
  return `${single.slice(0, 199)}…`;
}
