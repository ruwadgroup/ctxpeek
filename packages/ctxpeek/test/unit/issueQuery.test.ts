import { describe, expect, it } from "vitest";
import { buildIssueSearchQuery } from "../../src/fetch/issueQuery.js";

describe("buildIssueSearchQuery", () => {
  it("scopes to the repo and appends a default sort", () => {
    expect(buildIssueSearchQuery("vercel", "next.js", "hydration")).toBe(
      "repo:vercel/next.js hydration sort:updated-desc",
    );
  });

  it("omits state when 'all' and adds type qualifier", () => {
    const q = buildIssueSearchQuery("o", "r", "x", { state: "all", type: "pr" });
    expect(q).toBe("repo:o/r type:pr x sort:updated-desc");
  });

  it("adds state and issue type", () => {
    const q = buildIssueSearchQuery("o", "r", "x", { state: "closed", type: "issue" });
    expect(q).toContain("state:closed");
    expect(q).toContain("type:issue");
  });

  it("emits one label qualifier per label and quotes spaces", () => {
    const q = buildIssueSearchQuery("o", "r", undefined, { labels: ["bug", "area: app"] });
    expect(q).toContain("label:bug");
    expect(q).toContain('label:"area: app"');
  });

  it("includes author, assignee, and since", () => {
    const q = buildIssueSearchQuery("o", "r", "x", {
      author: "leerob",
      assignee: "shadcn",
      since: "2025-01-01",
    });
    expect(q).toContain("author:leerob");
    expect(q).toContain("assignee:shadcn");
    expect(q).toContain("updated:>=2025-01-01");
  });

  it("honours sort field and order", () => {
    const q = buildIssueSearchQuery("o", "r", "x", { sort: "comments", order: "asc" });
    expect(q.endsWith("sort:comments-asc")).toBe(true);
  });

  it("works with no free-text query (filters only)", () => {
    const q = buildIssueSearchQuery("o", "r", undefined, { labels: ["bug"] });
    expect(q).toBe("repo:o/r label:bug sort:updated-desc");
  });

  it("trims whitespace-only filters away", () => {
    const q = buildIssueSearchQuery("o", "r", "   ", { author: "  ", labels: ["  "] });
    expect(q).toBe("repo:o/r sort:updated-desc");
  });
});
