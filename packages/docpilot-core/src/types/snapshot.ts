import type { Forge } from "./repoSpec.js";

/**
 * A snapshot is `(forge, owner, repo, commit-sha)`. Refs (`main`, `v15`)
 * resolve to a sha at the start of each tool call; downstream operations
 * operate on the sha. See §3 of the design doc.
 */
export type Snapshot = {
  readonly forge: Forge;
  readonly owner: string;
  readonly repo: string;
  readonly commitSha: string;
  /** The original ref (e.g. `main`, `v15.0.0`) the user requested. */
  readonly requestedRef: string;
  readonly resolvedAt: string;
};

export type BlobRef = {
  readonly snapshot: Snapshot;
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
  readonly etag: string | undefined;
  readonly fetchedAt: string;
};
