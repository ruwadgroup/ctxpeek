import { describe, expect, it } from "vitest";
import { RateLimiter } from "../../src/fetch/ratelimit.js";
import type { ToolContext } from "../../src/tools/context.js";
import { buildRateLimitsTool } from "../../src/tools/rateLimits.js";

function makeContext(limiter: RateLimiter, fetch: ToolContext["http"]["fetch"]): ToolContext {
  return {
    config: {
      auth: {
        token: "",
      },
    },
    http: { fetch },
    limiter,
  } as unknown as ToolContext;
}

describe("rate_limits tool", () => {
  it("checks GitHub live by default without repeating primary headers locally", async () => {
    const limiter = new RateLimiter();
    const reset = Math.floor(Date.now() / 1000) + 3600;
    const ctx = makeContext(limiter, async () => ({
      status: 200,
      headers: {
        "x-ratelimit-remaining": "4212",
        "x-ratelimit-reset": String(reset),
      },
      body: Buffer.from(
        JSON.stringify({
          resources: {
            core: { limit: 5000, used: 788, remaining: 4212, reset },
            search: { limit: 30, used: 0, remaining: 30, reset },
            graphql: { limit: 5000, used: 5, remaining: 4995, reset },
          },
        }),
      ),
    }));

    const out = await buildRateLimitsTool(ctx)({});

    expect(out).toContain("## GitHub API (live)");
    expect(out).toContain("core: 4212/5000 remaining");
    expect(out).toContain("## Local throttler");
    expect(out).toContain("Mode:                normal");
    expect(out).not.toContain("Last GitHub primary");
    expect(out).not.toContain("Pass `{ live: true }`");
  });

  it("shows cached primary headers only when live checks are skipped", async () => {
    const limiter = new RateLimiter();
    const reset = Math.floor(Date.now() / 1000) + 3600;
    limiter.observe({
      "x-ratelimit-remaining": "42",
      "x-ratelimit-reset": String(reset),
    });
    let called = false;
    const ctx = makeContext(limiter, async () => {
      called = true;
      throw new Error("unexpected live check");
    });

    const out = await buildRateLimitsTool(ctx)({ live: false });

    expect(called).toBe(false);
    expect(out).toContain("Last GitHub primary: 42");
    expect(out).toContain("Live GitHub check skipped.");
  });
});
