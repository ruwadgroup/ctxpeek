/**
 * Rate-limit & secondary-limit accounting.
 *
 *   - 8 concurrent in-flight req cap (well under shared 100 limit)
 *   - 60 req/min token bucket (clear of 900 pts/min endpoint cap)
 *   - exp backoff with Retry-After honor on 429/403, max 5 retries
 *   - X-RateLimit-Remaining < 100 → switch to CDN-only and warn
 *
 * See design doc §4.6.
 */

export interface RateLimitState {
  readonly remaining: number | undefined;
  readonly resetAt: Date | undefined;
}

export class RateLimiter {
  constructor(
    private readonly _concurrentMax = 8,
    private readonly _perMinute = 60,
  ) {}

  async acquire(): Promise<void> {
    // TODO(v0.1, day-2): leaky-bucket + semaphore
  }

  release(): void {
    // TODO
  }

  observe(_state: RateLimitState): void {
    // TODO: emit "switch to CDN-only" notification when remaining < 100
  }
}
