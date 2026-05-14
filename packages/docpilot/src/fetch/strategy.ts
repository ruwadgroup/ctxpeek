/**
 * Fetch strategy — the ordered fallback chain that defines docpilot's
 * rate-limit posture.
 *
 *   Step 0  cache hit                     → free
 *   Step 1  REST contents + ETag (304)    → free if authed
 *   Step 2  jsDelivr CDN (commit-pinned)  → unmetered against GH
 *   Step 3  REST tree / blob              → metered
 *   Step 4  GraphQL alias batch (≥4 files)→ ~2 points
 *
 * See design doc §4 for numbers and rationale.
 */

export interface FetchOptions {
  readonly preferCdn: boolean;
  readonly concurrentMax: number;
  readonly secondaryBudgetPerMin: number;
}

export interface FetchResult {
  readonly bytes: Uint8Array;
  readonly etag: string | undefined;
  readonly source: "cache" | "rest" | "cdn" | "graphql";
}

export async function fetchBlob(
  _owner: string,
  _repo: string,
  _commitSha: string,
  _path: string,
  _opts: FetchOptions,
): Promise<FetchResult> {
  // TODO(v0.1, day-2..4): wire steps 0 → 4 with the cache layer
  throw new Error("not implemented");
}
