import { describe, expect, it } from "vitest";
import { classifyTree, isDocPath } from "../../src/format/docsPaths.js";

describe("isDocPath", () => {
  it("accepts top-level README", () => {
    expect(isDocPath("README.md")).toBe(true);
  });
  it("accepts docs/ subtree markdown", () => {
    expect(isDocPath("docs/getting-started.md")).toBe(true);
    expect(isDocPath("docs/01-app/02-routing.mdx")).toBe(true);
  });
  it("accepts llms.txt anywhere", () => {
    expect(isDocPath("llms.txt")).toBe(true);
    expect(isDocPath("subdir/llms-full.txt")).toBe(true);
  });
  it("rejects source code", () => {
    expect(isDocPath("src/index.ts")).toBe(false);
    expect(isDocPath("packages/foo/src/x.ts")).toBe(false);
  });
  it("rejects examples by default but accepts with include_examples", () => {
    expect(isDocPath("examples/postgres/README.md")).toBe(false);
    expect(isDocPath("examples/postgres/README.md", { includeExamples: true })).toBe(true);
  });
  it("honours subpath filter", () => {
    expect(isDocPath("packages/x/docs/intro.md", { subpath: "packages/x" })).toBe(true);
    expect(isDocPath("packages/y/docs/intro.md", { subpath: "packages/x" })).toBe(false);
  });
});

describe("classifyTree", () => {
  it("filters tree-api shape", () => {
    const out = classifyTree([
      { path: "README.md", type: "blob", size: 100, sha: "a" },
      { path: "src/index.ts", type: "blob", size: 100, sha: "b" },
      { path: "docs/api.md", type: "blob", size: 200, sha: "c" },
      { path: "docs", type: "tree", size: 0, sha: "d" },
    ]);
    expect(out.map((e) => e.path)).toEqual(["README.md", "docs/api.md"]);
  });
});
