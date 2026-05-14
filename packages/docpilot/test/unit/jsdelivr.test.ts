import { describe, expect, it } from "vitest";
import { jsDelivrUrl } from "../../src/fetch/jsdelivr.js";

describe("jsDelivrUrl", () => {
  it("builds the commit-pinned URL", () => {
    expect(jsDelivrUrl("vercel", "next.js", "a3b1f7c", "docs/intro.md")).toBe(
      "https://cdn.jsdelivr.net/gh/vercel/next.js@a3b1f7c/docs/intro.md",
    );
  });
  it("strips leading slash from path", () => {
    expect(jsDelivrUrl("o", "r", "abc", "/docs/x.md")).toBe("https://cdn.jsdelivr.net/gh/o/r@abc/docs/x.md");
  });
});
