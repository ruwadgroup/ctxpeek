/**
 * Path → ETag map for REST conditional GETs.
 *
 *   etag-map.json     { "{owner}/{repo}/{path}@{sha}": "<etag>" }
 *
 * Authenticated 304 responses do NOT count against the primary rate
 * limit (per docs.github.com), which is the central rate-limit win.
 */
export interface EtagStore {
  get(key: string): Promise<string | undefined>;
  put(key: string, etag: string): Promise<void>;
}

export function createEtagStore(_dir: string): EtagStore {
  // TODO(v0.1, day-2)
  throw new Error("not implemented");
}
