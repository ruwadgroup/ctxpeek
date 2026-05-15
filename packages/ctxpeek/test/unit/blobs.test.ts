import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createBlobStore } from "../../src/cache/blobs.js";
import { sha256Hex } from "../../src/util/sha.js";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ctxpeek-blobs-"));
}

describe("BlobStore", () => {
  it("round-trips bytes by sha", async () => {
    const dir = await makeTempDir();
    const store = createBlobStore(dir);
    const bytes = new TextEncoder().encode("hello world");
    const sha = sha256Hex(bytes);
    expect(await store.has(sha)).toBe(false);
    await store.write(sha, bytes);
    expect(await store.has(sha)).toBe(true);
    const got = await store.read(sha);
    expect(Buffer.from(got).toString("utf8")).toBe("hello world");
  });

  it("writeAndComputeSha is idempotent", async () => {
    const dir = await makeTempDir();
    const store = createBlobStore(dir);
    const bytes = new TextEncoder().encode("idempotent");
    const sha1 = await store.writeAndComputeSha(bytes);
    const sha2 = await store.writeAndComputeSha(bytes);
    expect(sha1).toBe(sha2);
  });

  it("size sums on-disk bytes", async () => {
    const dir = await makeTempDir();
    const store = createBlobStore(dir);
    await store.write(sha256Hex("a"), new TextEncoder().encode("a"));
    await store.write(sha256Hex("bb"), new TextEncoder().encode("bb"));
    expect(await store.size()).toBe(3);
  });
});
