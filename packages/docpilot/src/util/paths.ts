// XDG-style cache + log dirs via env-paths. Overridable via `[cache] dir` / `--cache-dir`.

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import envPaths from "env-paths";

export type DocpilotPaths = {
  readonly cache: string;
  readonly config: string;
  readonly logs: string;
  readonly blobs: string;
  readonly refs: string;
  readonly indexes: string;
  readonly resolutionsFile: string;
  readonly etagMapFile: string;
  readonly metaFile: string;
  readonly repoMetaFile: string;
  readonly limiterStateFile: string;
};

export function defaultPaths(): DocpilotPaths {
  const base = envPaths("docpilot", { suffix: "" });
  return paths(base.cache, base.config, base.log);
}

export function paths(cacheDir: string, configDir: string, logDir: string): DocpilotPaths {
  const cache = expandHome(cacheDir);
  return {
    cache,
    config: expandHome(configDir),
    logs: expandHome(logDir),
    blobs: path.join(cache, "blobs"),
    refs: path.join(cache, "refs"),
    indexes: path.join(cache, "indexes"),
    resolutionsFile: path.join(cache, "resolutions.json"),
    etagMapFile: path.join(cache, "etag-map.json"),
    metaFile: path.join(cache, "meta.json"),
    repoMetaFile: path.join(cache, "repo-meta.json"),
    limiterStateFile: path.join(cache, "limiter-state.json"),
  };
}

export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export async function ensureDirs(p: DocpilotPaths): Promise<void> {
  await Promise.all([
    fs.mkdir(p.cache, { recursive: true }),
    fs.mkdir(p.logs, { recursive: true }),
    fs.mkdir(p.blobs, { recursive: true }),
    fs.mkdir(p.refs, { recursive: true }),
    fs.mkdir(p.indexes, { recursive: true }),
  ]);
}

export function repoCacheKey(owner: string, repo: string): string {
  return `${owner.toLowerCase()}--${repo.toLowerCase()}`;
}

export function blobPath(blobsDir: string, sha256: string): string {
  return path.join(blobsDir, sha256.slice(0, 2), sha256);
}

export function refFile(refsDir: string, owner: string, repo: string, ref: string): string {
  const safe = encodeURIComponent(ref);
  return path.join(refsDir, repoCacheKey(owner, repo), `${safe}.json`);
}

export function treeFile(refsDir: string, owner: string, repo: string, sha: string): string {
  return path.join(refsDir, repoCacheKey(owner, repo), `tree-${sha}.json`);
}

export function indexFile(indexesDir: string, owner: string, repo: string, sha: string): string {
  return path.join(indexesDir, `${repoCacheKey(owner, repo)}--${sha}.minisearch.json`);
}
