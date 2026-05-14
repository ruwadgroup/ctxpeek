/**
 * Rate-limit & secondary-limit accounting.
 *
 *   - hard cap on concurrent in-flight requests (default 8, well under shared 100)
 *   - token bucket (default 60 req/min) to stay clear of 900 pts/min endpoint cap
 *   - exponential backoff with Retry-After honor on 429/403 is in HttpClient
 *   - X-RateLimit-Remaining < 100 → preferCdn switches on for the rest of session
 *
 * Design doc §4.6.
 */
import { sleep } from "../util/index.js";

export type RateLimitState = {
  readonly remaining: number | undefined;
  readonly resetAt: Date | undefined;
};

export class RateLimiter {
  private inflight = 0;
  private readonly waiters: Array<() => void> = [];
  private bucketTokens: number;
  private lastRefill = Date.now();
  private latestRemaining: number | undefined;
  private latestResetAt: Date | undefined;
  private degraded = false;

  constructor(
    private readonly concurrentMax = 8,
    private readonly perMinute = 60,
  ) {
    this.bucketTokens = perMinute;
  }

  isDegraded(): boolean {
    return this.degraded;
  }

  state(): RateLimitState {
    return { remaining: this.latestRemaining, resetAt: this.latestResetAt };
  }

  async acquire(): Promise<void> {
    while (this.inflight >= this.concurrentMax) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.inflight += 1;
    await this.takeToken();
  }

  release(): void {
    this.inflight -= 1;
    const w = this.waiters.shift();
    if (w) w();
  }

  observe(headers: Record<string, string>): void {
    const remHeader = headers["x-ratelimit-remaining"];
    const resetHeader = headers["x-ratelimit-reset"];
    if (remHeader !== undefined) {
      const n = Number(remHeader);
      if (Number.isFinite(n)) {
        this.latestRemaining = n;
        if (n < 100) this.degraded = true;
      }
    }
    if (resetHeader !== undefined) {
      const epoch = Number(resetHeader);
      if (Number.isFinite(epoch)) this.latestResetAt = new Date(epoch * 1000);
    }
  }

  private async takeToken(): Promise<void> {
    this.refill();
    while (this.bucketTokens < 1) {
      const waitMs = Math.ceil(60_000 / this.perMinute);
      await sleep(waitMs);
      this.refill();
    }
    this.bucketTokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefill;
    if (elapsedMs <= 0) return;
    const tokens = (elapsedMs / 60_000) * this.perMinute;
    this.bucketTokens = Math.min(this.perMinute, this.bucketTokens + tokens);
    this.lastRefill = now;
  }
}
