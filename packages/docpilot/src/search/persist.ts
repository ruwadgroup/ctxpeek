/**
 * Index persistence.
 *
 *   indexes/{owner}--{repo}--{commit_sha}.minisearch.json
 *
 * Persisted via JSON.stringify(index)/MiniSearch.loadJSON. Re-built when
 * snapshot sha changes; otherwise reused.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import MiniSearch from "minisearch";
import type { DocsIndex, IndexedDoc } from "./build.js";
import { createIndex } from "./build.js";

export async function saveIndex(filePath: string, index: DocsIndex): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const json = JSON.stringify(index);
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, json, "utf8");
  await fs.rename(tmp, filePath);
}

export async function loadIndex(filePath: string): Promise<DocsIndex | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  try {
    const template = createIndex();
    const options = (
      template as unknown as {
        _options: ConstructorParameters<typeof MiniSearch<IndexedDoc>>[0];
      }
    )._options;
    return MiniSearch.loadJSON<IndexedDoc>(raw, options);
  } catch {
    return null;
  }
}
