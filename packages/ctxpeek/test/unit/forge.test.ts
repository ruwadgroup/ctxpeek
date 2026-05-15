import { describe, expect, it } from "vitest";
import { getForgeDefinition, listForgeDefinitions, resolveForgeAlias } from "../../src/fetch/defineForge.js";
import { RateLimiter } from "../../src/fetch/ratelimit.js";
import { HttpClient } from "../../src/util/index.js";
import { noopLogger } from "../../src/util/logger.js";
import "../../src/fetch/forges/index.js";

const ctx = {
  http: new HttpClient(),
  limiter: new RateLimiter(),
  userAgent: "ctxpeek-test",
  logger: noopLogger,
  token: undefined,
};

describe("forge plug-in registry", () => {
  it("registers built-in github/gitlab/bitbucket", () => {
    const ids = listForgeDefinitions()
      .map((d) => d.id)
      .sort();
    expect(ids).toEqual(["bitbucket", "github", "gitlab"]);
  });

  it("resolves repo-spec aliases", () => {
    expect(resolveForgeAlias("gh")).toBe("github");
    expect(resolveForgeAlias("gl")).toBe("gitlab");
    expect(resolveForgeAlias("bb")).toBe("bitbucket");
    expect(resolveForgeAlias("github")).toBe("github");
    expect(resolveForgeAlias("nonsense")).toBeUndefined();
  });

  it("gitlab cdnUrl points at /gl/ on jsDelivr", () => {
    const def = getForgeDefinition("gitlab");
    expect(def).toBeDefined();
    const client = def!.create(ctx);
    expect(client.cdnUrl("group", "project", "abc", "/docs/x.md")).toBe(
      "https://cdn.jsdelivr.net/gl/group/project@abc/docs/x.md",
    );
  });

  it("bitbucket has no cdn", () => {
    const def = getForgeDefinition("bitbucket");
    expect(def).toBeDefined();
    const client = def!.create(ctx);
    expect(client.cdnUrl("w", "r", "sha", "p")).toBeNull();
  });

  it("forge field is set", () => {
    expect(getForgeDefinition("gitlab")!.create(ctx).forge).toBe("gitlab");
    expect(getForgeDefinition("bitbucket")!.create(ctx).forge).toBe("bitbucket");
  });
});
