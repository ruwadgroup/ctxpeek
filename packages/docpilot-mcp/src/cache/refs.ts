/**
 * Ref → sha mapping cache.
 *
 *   refs/vercel--next.js/HEAD.json
 *   refs/vercel--next.js/v15.0.0.json
 *   refs/vercel--next.js/tree-{sha}.json
 *
 * Each entry: { ref, sha, etag, fetched_at }.
 */
export interface RefStore {
  resolve(owner: string, repo: string, ref: string): Promise<string | null>;
  put(owner: string, repo: string, ref: string, sha: string, etag?: string): Promise<void>;
}

export function createRefStore(_dir: string): RefStore {
  // TODO(v0.1)
  throw new Error("not implemented");
}
