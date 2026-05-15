/**
 * Rate-limit & secondary-limit accounting.
 *
 *   - hard cap on concurrent in-flight requests (default 8, well under shared 100)
 *   - token bucket (default 60 req/min) to stay clear of 900 pts/min endpoint cap
 *   - exponential backoff with optional Retry-After honor on 429/5xx is in HttpClient
 *   - X-RateLimit-Remaining < 100 → degraded mode favors CDN where available
 *   - state (latestRemaining / resetAt / degraded) survives process restarts via
 *     an optional on-disk file so a fresh MCP server inherits the budget.
 *
 * Design doc §4.6.
 */
import { readJson, writeJson } from "../util/jsonStore.js";
import { sleep } from "../util/promise.js";

export type RateLimitState = {
  readonly remaining: number | undefined;
  readonly resetAt: Date | undefined;
  readonly observedAt: Date | undefined;
};

export type RateLimitSnapshot = RateLimitState & {
  readonly degraded: boolean;
  readonly inflight: number;
  readonly queued: number;
  readonly bucketTokens: number;
  readonly bucketCapacity: number;
  readonly secondaryBudgetPerMinute: number;
  readonly concurrentMax: number;
};

type PersistedState = {
  readonly remaining: number | null;
  readonly resetAt: string | null;
  readonly degraded: boolean;
  readonly updatedAt: string;
};

export class RateLimiter {
  private inflight = 0;
  private readonly waiters: Array<() => void> = [];
  private bucketTokens: number;
  private lastRefill = Date.now();
  private latestRemaining: number | undefined;
  private latestResetAt: Date | undefined;
  private latestObservedAt: Date | undefined;
  private degraded = false;
  private statePath: string | undefined;
  private lastPersist = 0;

  constructor(
    private readonly concurrentMax = 8,
    private readonly perMinute = 60,
  ) {
    this.bucketTokens = perMinute;
  }

  /**
   * Wire up an on-disk state file. Call `await hydrate(path)` from the server
   * boot path. Subsequent `observe()` calls schedule a debounced flush.
   */
  async hydrate(filePath: string): Promise<void> {
    this.statePath = filePath;
    const data = await readJson<PersistedState>(filePath);
    if (!data) return;
    if (data.resetAt) {
      const reset = new Date(data.resetAt);
      // If the reset is in the past the window has elapsed — discard.
      if (reset.getTime() > Date.now()) {
        this.latestResetAt = reset;
        if (typeof data.remaining === "number") this.latestRemaining = data.remaining;
        const updatedAt = Date.parse(data.updatedAt);
        if (Number.isFinite(updatedAt)) this.latestObservedAt = new Date(updatedAt);
        if (data.degraded) this.degraded = true;
      }
    }
  }

  isDegraded(): boolean {
    this.normalizePrimaryWindow();
    return this.degraded;
  }

  state(): RateLimitState {
    this.normalizePrimaryWindow();
    return {
      remaining: this.latestRemaining,
      resetAt: this.latestResetAt,
      observedAt: this.latestObservedAt,
    };
  }

  snapshot(): RateLimitSnapshot {
    this.refill();
    this.normalizePrimaryWindow();
    return {
      remaining: this.latestRemaining,
      resetAt: this.latestResetAt,
      observedAt: this.latestObservedAt,
      degraded: this.degraded,
      inflight: this.inflight,
      queued: this.waiters.length,
      bucketTokens: Number(this.bucketTokens.toFixed(2)),
      bucketCapacity: this.perMinute,
      secondaryBudgetPerMinute: this.perMinute,
      concurrentMax: this.concurrentMax,
    };
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
    let dirty = false;
    if (remHeader !== undefined) {
      const n = Number(remHeader);
      if (Number.isFinite(n)) {
        this.latestRemaining = n;
        this.degraded = n < 100;
        dirty = true;
      }
    }
    if (resetHeader !== undefined) {
      const epoch = Number(resetHeader);
      if (Number.isFinite(epoch)) {
        this.latestResetAt = new Date(epoch * 1000);
        dirty = true;
      }
    }
    if (dirty) {
      this.latestObservedAt = new Date();
      this.normalizePrimaryWindow();
      this.schedulePersist();
    }
  }

  private schedulePersist(): void {
    if (!this.statePath) return;
    // Debounce: at most once every 5 seconds. Don't await — let it race.
    const now = Date.now();
    if (now - this.lastPersist < 5000) return;
    this.lastPersist = now;
    const path = this.statePath;
    const payload: PersistedState = {
      remaining: this.latestRemaining ?? null,
      resetAt: this.latestResetAt ? this.latestResetAt.toISOString() : null,
      degraded: this.degraded,
      updatedAt: (this.latestObservedAt ?? new Date()).toISOString(),
    };
    writeJson(path, payload).catch(() => {
      // Best-effort. A failed persist is harmless; we just re-burn budget
      // next process boot.
    });
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

  private normalizePrimaryWindow(): void {
    if (!this.latestResetAt || this.latestResetAt.getTime() > Date.now()) return;
    this.latestRemaining = undefined;
    this.latestResetAt = undefined;
    this.latestObservedAt = undefined;
    this.degraded = false;
  }
}
