// Cache garbage collector.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { BlobStore } from "./blobs.js";
import type { RefStore } from "./refs.js";

export type GcOptions = {
  readonly maxSizeBytes: number;
  readonly maxAgeDays: number;
};

export type GcReport = {
  readonly freedBytes: number;
  readonly evicted: number;
  readonly remainingBytes: number;
};

export async function runGc(
  blobsDir: string,
  blobs: BlobStore,
  refs: RefStore,
  opts: GcOptions,
): Promise<GcReport> {
  const now = Date.now();
  const maxAgeMs = opts.maxAgeDays * 24 * 60 * 60 * 1000;

  const entries: { sha: string; bytes: number; mtimeMs: number }[] = [];
  let total = 0;
  for await (const e of blobs.entries()) {
    entries.push(e);
    total += e.bytes;
  }

  let freed = 0;
  let evicted = 0;

  for (const e of entries) {
    if (now - e.mtimeMs > maxAgeMs) {
      await deleteBlob(blobsDir, e.sha);
      freed += e.bytes;
      total -= e.bytes;
      evicted += 1;
    }
  }

  if (total > opts.maxSizeBytes) {
    const remaining = entries
      .filter((e) => now - e.mtimeMs <= maxAgeMs)
      .sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const e of remaining) {
      if (total <= opts.maxSizeBytes) break;
      await deleteBlob(blobsDir, e.sha);
      freed += e.bytes;
      total -= e.bytes;
      evicted += 1;
    }
  }

  for await (const r of refs.entries()) {
    if (now - r.mtimeMs > maxAgeMs * 2) {
      await fs.unlink(r.filePath).catch(() => undefined);
      evicted += 1;
    }
  }

  return { freedBytes: freed, evicted, remainingBytes: total };
}

async function deleteBlob(blobsDir: string, sha: string): Promise<void> {
  const file = path.join(blobsDir, sha.slice(0, 2), sha);
  await fs.unlink(file).catch(() => undefined);
}
