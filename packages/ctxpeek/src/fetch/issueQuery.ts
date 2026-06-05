/**
 * Pure builder for GitHub issue/PR search query strings. Shared by the REST
 * and GraphQL clients so filtering + sort behave identically on both paths.
 * No I/O — unit-testable in isolation.
 */

export type IssueSearchFilters = {
  readonly state?: "open" | "closed" | "all";
  readonly type?: "issue" | "pr" | "both";
  readonly labels?: ReadonlyArray<string>;
  readonly author?: string;
  readonly assignee?: string;
  /** ISO date (YYYY-MM-DD or full timestamp) → `updated:>=since`. */
  readonly since?: string;
  readonly sort?: "updated" | "created" | "comments";
  readonly order?: "asc" | "desc";
};

export type IssueSearchOptions = IssueSearchFilters & {
  readonly perPage?: number;
};

/** Quote a qualifier value when it contains whitespace (e.g. `label:"area: app"`). */
function quoteQualifier(v: string): string {
  return /\s/.test(v) ? `"${v}"` : v;
}

/**
 * Compose `repo:o/r state:… type:… label:"x" author:y assignee:z updated:>=d
 * {query} sort:field-order`. Empty/undefined filters are skipped.
 */
export function buildIssueSearchQuery(
  owner: string,
  repo: string,
  query: string | undefined,
  filters: IssueSearchFilters = {},
): string {
  const parts: string[] = [`repo:${owner}/${repo}`];

  if (filters.state && filters.state !== "all") parts.push(`state:${filters.state}`);
  if (filters.type === "issue") parts.push("type:issue");
  else if (filters.type === "pr") parts.push("type:pr");

  for (const label of filters.labels ?? []) {
    const trimmed = label.trim();
    if (trimmed) parts.push(`label:${quoteQualifier(trimmed)}`);
  }
  if (filters.author?.trim()) parts.push(`author:${filters.author.trim()}`);
  if (filters.assignee?.trim()) parts.push(`assignee:${filters.assignee.trim()}`);
  if (filters.since?.trim()) parts.push(`updated:>=${filters.since.trim()}`);

  if (query?.trim()) parts.push(query.trim());

  const sort = filters.sort ?? "updated";
  const order = filters.order ?? "desc";
  parts.push(`sort:${sort}-${order}`);

  return parts.join(" ");
}
