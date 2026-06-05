import { describe, expect, it } from "vitest";
import { GithubRestClient } from "../../src/fetch/githubRest.js";
import type { ToolContext } from "../../src/tools/context.js";
import { buildGetIssuesTool } from "../../src/tools/getIssues.js";
import type { HttpClient, HttpResponse } from "../../src/util/index.js";
import { noopLogger } from "../../src/util/index.js";

type Route = (url: string) => unknown;

function fakeHttp(route: Route): HttpClient {
  return {
    async fetch(url: string): Promise<HttpResponse> {
      const data = route(url);
      return {
        status: 200,
        headers: {},
        body: Buffer.from(JSON.stringify(data), "utf8"),
      };
    },
  } as unknown as HttpClient;
}

function ctxWith(route: Route): ToolContext {
  const rest = new GithubRestClient({ token: undefined, userAgent: "test", http: fakeHttp(route) });
  return { rest, graphql: null, logger: noopLogger } as unknown as ToolContext;
}

describe("get_issues read-one", () => {
  const route: Route = (url) => {
    if (url.includes("/comments")) {
      return [
        { user: { login: "alice" }, created_at: "2025-01-02T00:00:00Z", body: "first comment" },
        { user: { login: "bob" }, created_at: "2025-01-03T00:00:00Z", body: "second comment" },
      ];
    }
    return {
      number: 1234,
      title: "Hydration mismatch",
      state: "open",
      pull_request: {},
      html_url: "https://github.com/vercel/next.js/pull/1234",
      user: { login: "leerob" },
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-04T00:00:00Z",
      body: "Steps to reproduce…",
      comments: 2,
    };
  };

  it("renders body + comments and detects a PR", async () => {
    const out = await buildGetIssuesTool(ctxWith(route))({
      repo: "vercel/next.js",
      number: 1234,
      state: "open",
      type: "both",
      sort: "updated",
      order: "desc",
      limit: 5,
      comments: 5,
    });
    expect(out).toContain("#1234 PR · open · Hydration mismatch");
    expect(out).toContain("@leerob");
    expect(out).toContain("Steps to reproduce");
    expect(out).toContain("## Comments (first 2 of 2)");
    expect(out).toContain("**@alice**");
    expect(out).toContain("second comment");
  });

  it("skips the comments fetch when comments=0", async () => {
    let commentsHit = false;
    const out = await buildGetIssuesTool(
      ctxWith((url) => {
        if (url.includes("/comments")) commentsHit = true;
        return route(url);
      }),
    )({
      repo: "vercel/next.js",
      number: 1234,
      state: "open",
      type: "both",
      sort: "updated",
      order: "desc",
      limit: 5,
      comments: 0,
    });
    expect(commentsHit).toBe(false);
    expect(out).not.toContain("## Comments");
  });
});

describe("get_issues search", () => {
  it("renders a filtered hit list with a filters line", async () => {
    const route: Route = (url) => {
      expect(url).toContain("search/issues");
      return {
        items: [
          {
            number: 7,
            title: "A bug",
            state: "open",
            pull_request: undefined,
            html_url: "https://github.com/o/r/issues/7",
            updated_at: "2025-01-01T00:00:00Z",
            user: { login: "carol" },
            body: "details",
          },
        ],
      };
    };
    const out = await buildGetIssuesTool(ctxWith(route))({
      repo: "o/r",
      query: "bug",
      labels: ["bug"],
      author: "carol",
      state: "open",
      type: "both",
      sort: "comments",
      order: "desc",
      limit: 5,
      comments: 5,
    });
    expect(out).toContain('matching "bug"');
    expect(out).toContain("Filters:");
    expect(out).toContain("labels=bug");
    expect(out).toContain("author=carol");
    expect(out).toContain("#7 issue · open");
  });

  it("errors when neither query nor number is given", async () => {
    await expect(
      buildGetIssuesTool(ctxWith(() => ({})))({
        repo: "o/r",
        state: "open",
        type: "both",
        sort: "updated",
        order: "desc",
        limit: 5,
        comments: 5,
      }),
    ).rejects.toThrow(/query.*number/);
  });
});
