/**
 * jsDelivr GitHub CDN.
 *
 *   https://cdn.jsdelivr.net/gh/{owner}/{repo}@{commit_sha}/{path}
 *
 * Permanently cached at the commit-pinned URL. 50 MB per file cap.
 * Anonymous; never burns the GitHub primary or anonymous bucket.
 *
 * See design doc §4.2 step 2 — this is the most important rate-limit win.
 */
export const JSDELIVR_BASE = "https://cdn.jsdelivr.net/gh";
export const JSDELIVR_MAX_FILE_BYTES = 50 * 1024 * 1024;

export function jsDelivrUrl(owner: string, repo: string, commitSha: string, path: string): string {
  return `${JSDELIVR_BASE}/${owner}/${repo}@${commitSha}/${path.replace(/^\/+/, "")}`;
}

export async function fetchFromJsDelivr(_url: string): Promise<Uint8Array> {
  // TODO(v0.1, day-4): undici fetch + content-length guard against 50MB
  throw new Error("not implemented");
}
