import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../src/core/index.js";
import type { FetchContext } from "../../src/fetch/strategy.js";
import { fetchBlob } from "../../src/fetch/strategy.js";

describe("fetchBlob", () => {
  it("keeps CDN first but falls back to REST when CDN returns 404", async () => {
    const writes = new Map<string, Uint8Array>();
    const restBytes = new Uint8Array(Buffer.from("from-rest"));
    const ctx = {
      forges: {
        github: {
          forge: "github",
          hasToken: () => true,
          getContents: async () => ({ status: 200, etag: '"rest-etag"', bytes: restBytes }),
          cdnUrl: () => "https://cdn.example/file.md",
        },
      },
      cdn: {
        fetchFile: async () => {
          throw new NotFoundError("cdn");
        },
      },
      blobs: {
        has: async () => false,
        read: async () => new Uint8Array(),
        write: async (key: string, bytes: Uint8Array) => {
          writes.set(key, bytes);
        },
      },
      etags: {
        get: async () => undefined,
        put: async () => undefined,
      },
      limiter: {
        isDegraded: () => false,
      },
      logger: {
        debug: () => undefined,
        warn: () => undefined,
      },
    } as unknown as FetchContext;

    const result = await fetchBlob(ctx, "acme", "private-docs", "abc123", "README.md", {
      preferCdn: true,
      cdnEnabled: true,
    });

    expect(result.source).toBe("rest");
    expect(Buffer.from(result.bytes).toString("utf8")).toBe("from-rest");
    expect(writes.size).toBe(1);
  });
});
