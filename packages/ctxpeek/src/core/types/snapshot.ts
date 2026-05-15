import type { Forge } from "./repoSpec.js";

export type Snapshot = {
  readonly forge: Forge;
  readonly owner: string;
  readonly repo: string;
  readonly commitSha: string;
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
