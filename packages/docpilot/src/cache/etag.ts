// Path → ETag map for REST conditional GETs.
import { readJson, updateJson } from "../util/index.js";

export type EtagStore = {
  get(key: string): Promise<string | undefined>;
  put(key: string, etag: string): Promise<void>;
  delete(key: string): Promise<void>;
};

export function etagKey(owner: string, repo: string, ref: string, filePath: string): string {
  return `${owner}/${repo}/${filePath}@${ref}`;
}

export function createEtagStore(etagMapFile: string): EtagStore {
  return {
    async get(key) {
      const data = await readJson<Record<string, string>>(etagMapFile);
      return data?.[key];
    },
    async put(key, etag) {
      await updateJson<Record<string, string>>(etagMapFile, (current) => ({
        ...current,
        [key]: etag,
      }));
    },
    async delete(key) {
      await updateJson<Record<string, string>>(etagMapFile, (current) => {
        if (!current) return {};
        const next = { ...current };
        delete next[key];
        return next;
      });
    },
  };
}
