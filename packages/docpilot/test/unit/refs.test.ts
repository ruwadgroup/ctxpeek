import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore } from "../../src/cache/refs.js";

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "docpilot-refs-"));
}

describe("RefStore", () => {
  it("round-trips a RefRecord", async () => {
    const dir = await tmp();
    const store = createRefStore(dir);
    await store.put({
      owner: "vercel",
      repo: "next.js",
      ref: "v15.0.0",
      sha: "a3b1f7c",
      fetchedAt: new Date("2026-05-01").toISOString(),
    });
    const got = await store.resolve("vercel", "next.js", "v15.0.0");
    expect(got?.sha).toBe("a3b1f7c");
  });

  it("round-trips a tree record", async () => {
    const dir = await tmp();
    const store = createRefStore(dir);
    await store.putTree({
      owner: "o",
      repo: "r",
      commitSha: "abc",
      truncated: false,
      entries: [{ path: "README.md", type: "blob", size: 10, sha: "x" }],
      fetchedAt: new Date().toISOString(),
    });
    const got = await store.getTree("o", "r", "abc");
    expect(got?.entries.length).toBe(1);
    expect(got?.entries[0]?.path).toBe("README.md");
  });
});
