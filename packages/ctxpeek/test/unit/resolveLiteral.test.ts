import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { type ResolverContext, resolve } from "../../src/resolve/orchestrator.js";

describe("resolve literal repo specs", () => {
  it("preserves refs from configured package mappings", async () => {
    const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "ctxpeek-resolve-")));
    const cacheFile = path.join(dir, "resolutions.json");
    const ctx = {
      rest: {
        getRepo: async () => ({
          owner: "acme",
          repo: "web",
          defaultBranch: "main",
          stars: 0,
          description: null,
          latestTag: null,
        }),
      },
      forges: {},
      graphql: null,
      http: {},
      logger: {
        debug: () => undefined,
      },
    } as unknown as ResolverContext;

    const first = await resolve(ctx, "acme/web@v2.4.1#packages/ui", {
      ecosystems: [],
      githubSearchFallback: false,
      cacheFile,
    });
    const second = await resolve(ctx, "acme/web@v2.4.1#packages/ui", {
      ecosystems: [],
      githubSearchFallback: false,
      cacheFile,
    });

    expect(first.best).toMatchObject({
      owner: "acme",
      repo: "web",
      ref: "v2.4.1",
      subpath: "packages/ui",
      source: "literal",
    });
    expect(second.fromCache).toBe(false);
    expect(second.best).toMatchObject({
      ref: "v2.4.1",
      subpath: "packages/ui",
    });
  });
});
