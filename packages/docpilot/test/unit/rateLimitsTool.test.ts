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
  it("checks GitHub automatically without repeating primary headers locally", async () => {
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

    expect(out).toContain("## GitHub API");
    expect(out).toContain("core: 4212/5000 remaining");
    expect(out).toContain("## Local throttler");
    expect(out).toContain("Mode:                normal");
    expect(out).not.toContain("Last GitHub primary");
  });

  it("falls back to cached primary headers when GitHub is unreachable", async () => {
    const limiter = new RateLimiter();
    const reset = Math.floor(Date.now() / 1000) + 3600;
    limiter.observe({
      "x-ratelimit-remaining": "42",
      "x-ratelimit-reset": String(reset),
    });
    let calls = 0;
    const ctx = makeContext(limiter, async () => {
      calls += 1;
      throw new Error("network blocked");
    });
    const handler = buildRateLimitsTool(ctx);

    const first = await handler({});
    const second = await handler({});

    expect(calls).toBe(1);
    expect(first).toContain("GitHub check unavailable: Error: network blocked.");
    expect(first).toContain("Next retry:");
    expect(first).toContain("Last GitHub primary: 42");
    expect(second).toContain("GitHub check delayed after the previous failure.");
    expect(second).toContain("Last GitHub primary: 42");
  });
});
