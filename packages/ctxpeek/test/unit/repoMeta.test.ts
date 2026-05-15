import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { RepoMetaCache, type RepoMetaRecord } from "../../src/cache/repoMeta.js";

async function makeTempFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ctxpeek-repometa-"));
  return path.join(dir, "repo-meta.json");
}

const baseRecord = (overrides: Partial<RepoMetaRecord> = {}): RepoMetaRecord => ({
  forge: "github",
  owner: "vercel",
  repo: "next.js",
  defaultBranch: "canary",
  stars: 100000,
  description: "React framework",
  latestTag: null,
  latestTagFetchedAt: null,
  fetchedAt: new Date().toISOString(),
  ...overrides,
});

describe("RepoMetaCache", () => {
  it("round-trips a record through disk", async () => {
    const file = await makeTempFile();
    const a = new RepoMetaCache(file);
    await a.put(baseRecord());
    const b = new RepoMetaCache(file);
    const got = await b.get("github", "vercel", "next.js");
    expect(got?.defaultBranch).toBe("canary");
    expect(got?.stars).toBe(100000);
  });

  it("treats lookup keys as case-insensitive", async () => {
    const file = await makeTempFile();
    const c = new RepoMetaCache(file);
    await c.put(baseRecord({ owner: "Vercel", repo: "Next.js" }));
    expect(await c.get("github", "vercel", "next.js")).toBeTruthy();
    expect(await c.get("github", "VERCEL", "NEXT.JS")).toBeTruthy();
  });

  it("expires records older than the 7-day TTL", async () => {
    const file = await makeTempFile();
    const c = new RepoMetaCache(file);
    const stale = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await c.put(baseRecord({ fetchedAt: stale }));
    expect(await c.get("github", "vercel", "next.js")).toBeNull();
  });

  it("returns undefined for latestTag when not yet fetched, null when fetched-and-empty", async () => {
    const file = await makeTempFile();
    const c = new RepoMetaCache(file);
    await c.put(baseRecord());
    expect(await c.getLatestTag("github", "vercel", "next.js")).toBeUndefined();
    await c.putLatestTag("github", "vercel", "next.js", null);
    expect(await c.getLatestTag("github", "vercel", "next.js")).toBeNull();
    await c.putLatestTag("github", "vercel", "next.js", "v15.0.0");
    expect(await c.getLatestTag("github", "vercel", "next.js")).toBe("v15.0.0");
  });

  it("negative cache remembers missing repos for ~5 min", async () => {
    const file = await makeTempFile();
    const c = new RepoMetaCache(file);
    expect(c.isKnownMissing("github", "nope", "repo")).toBe(false);
    c.markMissing("github", "nope", "repo");
    expect(c.isKnownMissing("github", "nope", "repo")).toBe(true);
    // ref-specific entries are separate from the bare-owner-repo entry
    c.markMissing("github", "vercel", "next.js", "v999.0.0");
    expect(c.isKnownMissing("github", "vercel", "next.js", "v999.0.0")).toBe(true);
    expect(c.isKnownMissing("github", "vercel", "next.js")).toBe(false);
  });

  it("dedup coalesces concurrent identical calls", async () => {
    const file = await makeTempFile();
    const c = new RepoMetaCache(file);
    let calls = 0;
    const work = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return calls;
    };
    const [a, b, c2] = await Promise.all([c.dedup("k", work), c.dedup("k", work), c.dedup("k", work)]);
    expect(calls).toBe(1);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(c2).toBe(1);
    // Different key starts a new call.
    const d = await c.dedup("k2", work);
    expect(d).toBe(2);
  });
});
