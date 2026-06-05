import { z } from "zod";
import type { IssueHit } from "../fetch/githubRest.js";
import type { IssueSearchOptions } from "../fetch/issueQuery.js";
import { parseRepoSpec } from "../util/repoSpec.js";
import { formatRelativeAge } from "../util/tokens.js";
import type { ToolContext } from "./context.js";

// Kept as a plain ZodObject (not ZodEffects) so the server can read `.shape`
// for the MCP input schema. The "query OR number" rule is enforced in the
// handler, which yields a clearer client-facing error than a schema refinement.
export const getIssuesInput = z.object({
  repo: z.string(),
  /** Free-text search. Required unless `number` is given (read-one mode). */
  query: z.string().min(1).optional(),
  /** Read-one mode: fetch this issue/PR's full body + top comments. */
  number: z.number().int().positive().optional(),
  state: z.enum(["open", "closed", "all"]).default("open"),
  type: z.enum(["issue", "pr", "both"]).default("both"),
  /** Filter by labels (AND). Values with spaces are quoted automatically. */
  labels: z.array(z.string()).optional(),
  author: z.string().optional(),
  assignee: z.string().optional(),
  /** ISO date — only items updated on/after this (`updated:>=since`). */
  since: z.string().optional(),
  sort: z.enum(["updated", "created", "comments"]).default("updated"),
  order: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().int().positive().max(20).default(5),
  /** Comments to include in read-one mode. */
  comments: z.number().int().nonnegative().max(20).default(5),
});

export type GetIssuesInput = z.infer<typeof getIssuesInput>;

export function buildGetIssuesTool(ctx: ToolContext) {
  return async (input: GetIssuesInput): Promise<string> => {
    const spec = parseRepoSpec(input.repo);
    if (input.number !== undefined) {
      return renderOne(ctx, spec.owner, spec.repo, input.number, input.comments);
    }
    if (input.query === undefined) {
      throw new Error("provide either `query` (search) or `number` (read one issue/PR)");
    }
    return renderSearch(ctx, spec.owner, spec.repo, input);
  };
}

async function renderSearch(
  ctx: ToolContext,
  owner: string,
  repo: string,
  input: GetIssuesInput,
): Promise<string> {
  const opts: IssueSearchOptions = {
    state: input.state,
    type: input.type,
    sort: input.sort,
    order: input.order,
    perPage: input.limit,
    ...(input.labels ? { labels: input.labels } : {}),
    ...(input.author ? { author: input.author } : {}),
    ...(input.assignee ? { assignee: input.assignee } : {}),
    ...(input.since ? { since: input.since } : {}),
  };
  const hits = await searchIssuesPreferGraphql(ctx, owner, repo, input.query, opts);
  const lines: string[] = [];
  lines.push(
    `# Issues / PRs in ${owner}/${repo} matching "${input.query ?? ""}"  (${hits.length} hit${
      hits.length === 1 ? "" : "s"
    })`,
  );
  const active = describeFilters(input);
  if (active) lines.push(`_Filters: ${active}_`);
  lines.push("");
  if (hits.length === 0) {
    lines.push('_No matches. Loosen the filters or set `state: "all"` to include closed items._');
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
}

const BODY_BUDGET = 6000;
const COMMENT_BUDGET = 1500;

async function renderOne(
  ctx: ToolContext,
  owner: string,
  repo: string,
  number: number,
  commentCount: number,
): Promise<string> {
  const detail = await ctx.rest.getIssue(owner, repo, number);
  const comments =
    commentCount > 0 && detail.totalComments > 0
      ? await ctx.rest.getIssueComments(owner, repo, number, commentCount)
      : [];

  const kind = detail.isPullRequest ? "PR" : "issue";
  const lines: string[] = [];
  lines.push(`# #${detail.number} ${kind} · ${detail.state} · ${detail.title}`);
  lines.push(
    `_@${detail.author} · opened ${formatRelativeAge(detail.createdAt)} · updated ${formatRelativeAge(
      detail.updatedAt,
    )} · ${detail.totalComments} comment${detail.totalComments === 1 ? "" : "s"}_`,
  );
  lines.push(detail.url);
  lines.push("");
  lines.push(clamp(detail.body || "_(no description)_", BODY_BUDGET));

  if (comments.length > 0) {
    lines.push("");
    lines.push(`## Comments (first ${comments.length} of ${detail.totalComments})`);
    for (const c of comments) {
      lines.push("");
      lines.push(`**@${c.author}** · ${formatRelativeAge(c.createdAt)}`);
      lines.push(clamp(c.body, COMMENT_BUDGET));
    }
  } else if (detail.totalComments > commentCount && commentCount > 0) {
    lines.push("");
    lines.push(`_${detail.totalComments} comments — open the URL above to read them._`);
  }
  return lines.join("\n");
}

function describeFilters(input: GetIssuesInput): string {
  const out: string[] = [];
  if (input.labels?.length) out.push(`labels=${input.labels.join(",")}`);
  if (input.author) out.push(`author=${input.author}`);
  if (input.assignee) out.push(`assignee=${input.assignee}`);
  if (input.since) out.push(`since=${input.since}`);
  out.push(`state=${input.state}`, `type=${input.type}`, `sort=${input.sort}-${input.order}`);
  return out.join(" · ");
}

function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n_… truncated (${s.length} chars total)_`;
}

function truncate(s: string): string {
  const single = s.replace(/\s+/g, " ").trim();
  if (single.length <= 200) return single;
  return `${single.slice(0, 199)}…`;
}

async function searchIssuesPreferGraphql(
  ctx: ToolContext,
  owner: string,
  repo: string,
  query: string | undefined,
  opts: IssueSearchOptions,
): Promise<ReadonlyArray<IssueHit>> {
  // GraphQL search uses the 5000pt/hr budget; REST /search/* uses the 30/min
  // bucket. Prefer GraphQL when a token is available; REST stays as fallback.
  if (ctx.graphql) {
    try {
      return await ctx.graphql.searchIssues(owner, repo, query, opts);
    } catch (err) {
      ctx.logger.debug("get_issues: GraphQL search failed, falling back to REST", {
        err: String(err),
      });
    }
  }
  return ctx.rest.searchIssues(owner, repo, query, opts);
}
