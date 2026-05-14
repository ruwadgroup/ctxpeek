import { createHash } from "node:crypto";

export function sha256Hex(bytes: Uint8Array | string): string {
  const h = createHash("sha256");
  h.update(bytes);
  return h.digest("hex");
}

/** sha256(canonical-ref || ":" || path) — used as the blob cache key. */
export function blobKey(commitSha: string, filePath: string): string {
  return sha256Hex(`${commitSha}:${filePath}`);
}
