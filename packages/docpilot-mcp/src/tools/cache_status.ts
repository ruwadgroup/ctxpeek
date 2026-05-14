/**
 * Tool: cache_status
 *
 * Diagnostic: prints cache hits, sizes, sha of cached snapshot, last
 * revalidate time.
 *
 * See design doc §8.8.
 */
import { z } from "zod";

export const cacheStatusInput = z.object({
  repo: z.string().optional(),
});

export type CacheStatusInput = z.infer<typeof cacheStatusInput>;

export async function cacheStatus(_input: CacheStatusInput): Promise<string> {
  // TODO(v0.1, week-2): walk env-paths cache dir, summarize
  throw new Error("not implemented");
}
