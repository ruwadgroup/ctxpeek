import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { RateLimiter } from "../../src/fetch/ratelimit.js";

async function makeTempFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ctxpeek-limiter-"));
  return path.join(dir, "limiter-state.json");
}

async function waitForPersistedState(file: string): Promise<void> {
  const deadline = Date.now() + 1_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      JSON.parse(await fs.readFile(file, "utf8"));
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("timed out waiting for persisted limiter state");
}

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
    const futureEpoch = Math.floor(Date.now() / 1000) + 3600;
    rl.observe({ "x-ratelimit-reset": String(futureEpoch) });
    expect(rl.state().resetAt?.getTime()).toBe(futureEpoch * 1000);
  });
  it("exposes local limiter accounting as a snapshot", () => {
    const rl = new RateLimiter(4, 30);
    const futureEpoch = Math.floor(Date.now() / 1000) + 3600;
    rl.observe({ "x-ratelimit-remaining": "120", "x-ratelimit-reset": String(futureEpoch) });
    expect(rl.snapshot()).toMatchObject({
      remaining: 120,
      degraded: false,
      inflight: 0,
      queued: 0,
      bucketCapacity: 30,
      secondaryBudgetPerMinute: 30,
      concurrentMax: 4,
    });
  });
  it("rehydrates degraded state from disk when reset is still in the future", async () => {
    const file = await makeTempFile();
    const a = new RateLimiter();
    await a.hydrate(file);
    const futureEpoch = Math.floor(Date.now() / 1000) + 3600;
    a.observe({ "x-ratelimit-remaining": "10", "x-ratelimit-reset": String(futureEpoch) });

    await waitForPersistedState(file);

    const b = new RateLimiter();
    await b.hydrate(file);
    expect(b.isDegraded()).toBe(true);
    expect(b.state().remaining).toBe(10);
  });
  it("ignores persisted state whose reset window has elapsed", async () => {
    const file = await makeTempFile();
    const stale = {
      remaining: 5,
      resetAt: new Date(Date.now() - 60_000).toISOString(),
      degraded: true,
      updatedAt: new Date().toISOString(),
    };
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(stale), "utf8");
    const rl = new RateLimiter();
    await rl.hydrate(file);
    expect(rl.isDegraded()).toBe(false);
    expect(rl.state().remaining).toBeUndefined();
  });
});
