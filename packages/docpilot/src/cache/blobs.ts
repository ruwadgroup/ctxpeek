// Content-addressed blob store.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { blobPath, sha256Hex } from "../util/index.js";

export type BlobStore = {
  has(key: string): Promise<boolean>;
  /**
   * Read the bytes stored under `key`. `key` is the docpilot cache key
   * (sha256 of "{commitSha}:{path}") — NOT the sha256 of the content. The
   * content sha is recoverable via `writeAndComputeSha` for callers that
   * want content-addressed storage separately.
   */
  read(key: string): Promise<Uint8Array>;
  write(key: string, bytes: Uint8Array): Promise<void>;
  /** Write bytes under their content-sha (sha256 of the bytes). */
  writeAndComputeSha(bytes: Uint8Array): Promise<string>;
  /** Total bytes stored in the blobs subtree (best-effort, sums file sizes). */
  size(): Promise<number>;
  /** Iterate entries with their on-disk size and mtime. Used by GC. */
  entries(): AsyncIterableIterator<{
    sha: string;
    bytes: number;
    mtimeMs: number;
  }>;
};

export function createBlobStore(blobsDir: string): BlobStore {
  return {
    async has(key) {
      try {
        await fs.access(blobPath(blobsDir, key));
        return true;
      } catch {
        return false;
      }
    },

    async read(key) {
      const file = blobPath(blobsDir, key);
      const buf = await fs.readFile(file);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    },

    async write(key, bytes) {
      const file = blobPath(blobsDir, key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, bytes);
      await fs.rename(tmp, file);
    },

    async writeAndComputeSha(bytes) {
      const sha = sha256Hex(bytes);
      const file = blobPath(blobsDir, sha);
      try {
        await fs.access(file);
        return sha;
      } catch {
        // not present — write
      }
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, bytes);
      await fs.rename(tmp, file);
      return sha;
    },

    async size() {
      let total = 0;
      for await (const e of walkBlobs(blobsDir)) total += e.bytes;
      return total;
    },

    entries() {
      return walkBlobs(blobsDir);
    },
  };
}

async function* walkBlobs(
  blobsDir: string,
): AsyncIterableIterator<{ sha: string; bytes: number; mtimeMs: number }> {
  let outer: import("node:fs").Dirent[];
  try {
    outer = await fs.readdir(blobsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  for (const shard of outer) {
    if (!shard.isDirectory()) continue;
    const shardPath = path.join(blobsDir, shard.name);
    const files = await fs.readdir(shardPath, { withFileTypes: true });
    for (const f of files) {
      if (!f.isFile()) continue;
      const filePath = path.join(shardPath, f.name);
      const stat = await fs.stat(filePath);
      yield { sha: f.name, bytes: stat.size, mtimeMs: stat.mtimeMs };
    }
  }
}
