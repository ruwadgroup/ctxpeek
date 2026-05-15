import { describe, expect, it } from "vitest";
import { approxTokens, renderFrontmatter } from "../../src/format/frontmatter.js";

describe("renderFrontmatter", () => {
  it("emits YAML frontmatter with expected keys", () => {
    const md = renderFrontmatter({
      repo: "vercel/next.js",
      ref: "v15.0.0",
      commit: "a3b1f7c",
      path: "docs/intro.md",
      size: 1024,
    });
    expect(md.startsWith("---")).toBe(true);
    expect(md.endsWith("---")).toBe(true);
    expect(md).toContain("repo: vercel/next.js");
    expect(md).toContain("ref: v15.0.0");
    expect(md).toContain("path: docs/intro.md");
    expect(md).not.toContain("~tokens:");
    expect(md).not.toContain("source:");
  });
  it("emits debug metadata only when provided", () => {
    const md = renderFrontmatter({
      repo: "vercel/next.js",
      ref: "v15.0.0",
      commit: "a3b1f7c",
      path: "docs/intro.md",
      size: 1024,
      source: "cdn",
      tokensApprox: 256,
    });
    expect(md).toContain("source: cdn");
    expect(md).toContain("~tokens: 256");
  });
  it("quotes weird path characters", () => {
    const md = renderFrontmatter({
      repo: "o/r",
      ref: "main",
      commit: "abc",
      path: "weird path with spaces.md",
      size: 0,
    });
    expect(md).toContain('path: "weird path with spaces.md"');
  });
});

describe("approxTokens (frontmatter export)", () => {
  it("matches util/tokens", () => {
    expect(approxTokens("hello world")).toBe(3);
  });
});
