import { describe, expect, it } from "vitest";
import { renderSearchResults } from "../../src/format/searchMd.js";

describe("renderSearchResults", () => {
  it("renders header + hits", () => {
    const md = renderSearchResults(
      "middleware",
      [
        {
          path: "docs/middleware.md",
          score: 12.4,
          snippet: "Middleware lets you run code before a request is completed.",
        },
        { path: "docs/api/middleware.md", score: 9.1, snippet: "" },
      ],
      { repoLabel: "vercel/next.js@v15.0.0", elapsedMs: 42 },
    );
    expect(md).toContain("# Search:");
    expect(md).toContain("docs/middleware.md");
    expect(md).toContain("score 12.4");
    expect(md).toContain("docs/api/middleware.md");
  });
  it("renders 'no matches' when empty", () => {
    const md = renderSearchResults("nothing", [], {
      repoLabel: "o/r",
      elapsedMs: 5,
    });
    expect(md).toContain("No matches");
  });
});
