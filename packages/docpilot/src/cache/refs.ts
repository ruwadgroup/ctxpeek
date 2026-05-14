// Ref → sha mapping cache.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readJson, refFile, treeFile, writeJson } from "../util/index.js";

export type RefRecord = {
  readonly owner: string;
  readonly repo: string;
  readonly ref: string;
  readonly sha: string;
  readonly etag?: string;
  readonly fetchedAt: string;
};

export type TreeEntry = {
  readonly path: string;
  readonly type: "blob" | "tree";
  readonly size: number;
  readonly sha: string;
};

export type TreeRecord = {
  readonly owner: string;
  readonly repo: string;
  readonly commitSha: string;
  readonly truncated: boolean;
  readonly entries: ReadonlyArray<TreeEntry>;
  readonly fetchedAt: string;
};

export type RefStore = {
  resolve(owner: string, repo: string, ref: string): Promise<RefRecord | null>;
  put(record: RefRecord): Promise<void>;
  getTree(owner: string, repo: string, sha: string): Promise<TreeRecord | null>;
  putTree(record: TreeRecord): Promise<void>;
  entries(): AsyncIterableIterator<{
    filePath: string;
    mtimeMs: number;
    bytes: number;
  }>;
};

export function createRefStore(refsDir: string): RefStore {
  return {
    async resolve(owner, repo, ref) {
      return readJson<RefRecord>(refFile(refsDir, owner, repo, ref));
    },
    async put(record) {
      await writeJson(refFile(refsDir, record.owner, record.repo, record.ref), record);
    },
    async getTree(owner, repo, sha) {
      return readJson<TreeRecord>(treeFile(refsDir, owner, repo, sha));
    },
    async putTree(record) {
      await writeJson(treeFile(refsDir, record.owner, record.repo, record.commitSha), record);
    },
    entries() {
      return walkRefs(refsDir);
    },
  };
}

async function* walkRefs(
  refsDir: string,
): AsyncIterableIterator<{ filePath: string; mtimeMs: number; bytes: number }> {
  let outer: import("node:fs").Dirent[];
  try {
    outer = await fs.readdir(refsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  for (const repoDir of outer) {
    if (!repoDir.isDirectory()) continue;
    const dirPath = path.join(refsDir, repoDir.name);
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    for (const f of files) {
      if (!f.isFile()) continue;
      const fp = path.join(dirPath, f.name);
      const stat = await fs.stat(fp);
      yield { filePath: fp, mtimeMs: stat.mtimeMs, bytes: stat.size };
    }
  }
}
