import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createEtagStore, etagKey } from "../../src/cache/etag.js";

async function tmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "docpilot-etag-"));
}

describe("EtagStore", () => {
  it("round-trips an etag", async () => {
    const dir = await tmp();
    const store = createEtagStore(path.join(dir, "etag-map.json"));
    const key = etagKey("o", "r", "main", "docs/x.md");
    expect(await store.get(key)).toBeUndefined();
    await store.put(key, '"abc123"');
    expect(await store.get(key)).toBe('"abc123"');
    await store.delete(key);
    expect(await store.get(key)).toBeUndefined();
  });
});
