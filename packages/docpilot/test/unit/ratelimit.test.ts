import { describe, expect, it } from "vitest";
import { RateLimiter } from "../../src/fetch/ratelimit.js";

describe("RateLimiter", () => {
  it("flips into degraded mode when X-RateLimit-Remaining < 100", () => {
    const rl = new RateLimiter();
    expect(rl.isDegraded()).toBe(false);
    rl.observe({ "x-ratelimit-remaining": "50" });
    expect(rl.isDegraded()).toBe(true);
    expect(rl.state().remaining).toBe(50);
  });
  it("stores reset epoch as Date", () => {
    const rl = new RateLimiter();
    rl.observe({ "x-ratelimit-reset": "1717000000" });
    expect(rl.state().resetAt?.getTime()).toBe(1717000000 * 1000);
  });
});
