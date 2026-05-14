import { describe, expect, it } from "vitest";
import { renderTree } from "../../src/format/tree.js";

describe("renderTree", () => {
  it("renders a small docs tree", () => {
    const md = renderTree(
      [
        {
          path: "README.md",
          size: 6500,
          highSignal: true,
          highlightedInNav: false,
          recentlyChanged: false,
        },
        {
          path: "docs/intro.md",
          size: 1200,
          highSignal: false,
          highlightedInNav: false,
          recentlyChanged: true,
        },
        {
          path: "docs/api/routing.md",
          size: 9000,
          highSignal: false,
          highlightedInNav: true,
          recentlyChanged: false,
        },
      ],
      {
        repoLabel: "owner/repo",
        resolvedRef: "main",
        commitSha: "a3b1f7cd",
        tokensApprox: 5000,
        truncated: false,
        subpath: undefined,
      },
    );
    expect(md).toContain("# owner/repo@main — docs");
    expect(md).toContain("README.md");
    expect(md).toContain("docs/");
    expect(md).toContain("api/");
    expect(md).toContain("routing.md");
    expect(md).toContain("✦");
    expect(md).toContain("✦✦");
    expect(md).toContain("⚠️");
    expect(md).toContain("Pin: main → a3b1f7c");
  });
  it("handles empty tree", () => {
    const md = renderTree([], {
      repoLabel: "owner/repo",
      resolvedRef: "main",
      commitSha: "abc",
      tokensApprox: undefined,
      truncated: false,
      subpath: undefined,
    });
    expect(md).toContain("No documentation files found");
  });
});
