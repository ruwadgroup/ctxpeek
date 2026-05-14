import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { blobPath, expandHome, refFile, repoCacheKey, treeFile } from "../../src/util/paths.js";

describe("path helpers", () => {
  it("expands ~", () => {
    expect(expandHome("~")).toBe(os.homedir());
    expect(expandHome("~/foo")).toBe(path.join(os.homedir(), "foo"));
    expect(expandHome("/abs/path")).toBe("/abs/path");
  });
  it("blobPath shards by first two hex chars", () => {
    expect(blobPath("/cache/blobs", "ab12cdef")).toBe(path.join("/cache/blobs", "ab", "ab12cdef"));
  });
  it("repoCacheKey lowercases", () => {
    expect(repoCacheKey("Vercel", "Next.js")).toBe("vercel--next.js");
  });
  it("refFile encodes safely", () => {
    expect(refFile("/r", "o", "r", "v1.0.0")).toBe(path.join("/r", "o--r", "v1.0.0.json"));
    expect(refFile("/r", "o", "r", "feat/x")).toBe(path.join("/r", "o--r", "feat%2Fx.json"));
  });
  it("treeFile path", () => {
    expect(treeFile("/r", "o", "r", "abc123")).toBe(path.join("/r", "o--r", "tree-abc123.json"));
  });
});
