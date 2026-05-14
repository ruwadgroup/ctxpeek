/**
 * Cache garbage collector.
 *
 *   - LRU eviction over a configurable cap (default 1 GB).
 *   - Snapshots older than 14 days with no recent access evicted first.
 *   - Resolutions older than 30 days re-resolved on next use.
 *
 * See design doc §9.2.
 */
export interface GcOptions {
  readonly maxSizeBytes: number;
  readonly maxAgeDays: number;
}

export async function runGc(_dir: string, _opts: GcOptions): Promise<{ freedBytes: number; evicted: number }> {
  // TODO(v0.2)
  return { freedBytes: 0, evicted: 0 };
}
