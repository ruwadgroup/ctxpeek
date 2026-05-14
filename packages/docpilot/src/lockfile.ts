// Lockfile / manifest detection — public façade.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Ecosystem } from "./config.js";
import {
  getLockfileParser,
  getParserForFilename,
  type LockedDep as LockedDepCore,
  listLockfileParsers,
} from "./lockfile/defineLockfileParser.js";
import { BUILT_IN_LOCKFILE_PARSERS } from "./lockfile/parsers/index.js";

// Each parser registers itself on import; reference the array so it
// remains "used" from the linter's perspective.
void BUILT_IN_LOCKFILE_PARSERS;

export type LockedDep = LockedDepCore & { readonly ecosystem: Ecosystem };

export type DetectedManifest = {
  readonly file: string;
  readonly ecosystem: Ecosystem;
  readonly deps: ReadonlyArray<LockedDep>;
};

export type { LockfileParserDefinition } from "./lockfile/defineLockfileParser.js";
export {
  defineLockfileParser,
  listLockfileParsers,
} from "./lockfile/defineLockfileParser.js";

/**
 * Detect manifests in `dir` and its ancestors up to the filesystem root or
 * the user's home directory (whichever comes first). Returns the *first*
 * directory's manifests so we don't accidentally vacuum a monorepo root
 * when the user just opened a child package.
 */
export async function detectManifests(
  dir: string,
  stopAt?: string,
): Promise<ReadonlyArray<DetectedManifest>> {
  const knownFiles = new Set<string>();
  for (const p of listLockfileParsers()) for (const fn of p.filenames) knownFiles.add(fn);

  let cur = path.resolve(dir);
  const stop = stopAt ? path.resolve(stopAt) : null;
  while (true) {
    const found: DetectedManifest[] = [];
    for (const filename of knownFiles) {
      const file = path.join(cur, filename);
      try {
        const stat = await fs.stat(file);
        if (!stat.isFile()) continue;
        const parser = getParserForFilename(filename);
        if (!parser) continue;
        const raw = await fs.readFile(file, "utf8");
        const parsed = parser.parse(raw, filename);
        found.push({
          file,
          ecosystem: parser.ecosystem as Ecosystem,
          deps: parsed.map((d) => ({
            ...d,
            ecosystem: parser.ecosystem as Ecosystem,
          })),
        });
      } catch {
        // not present, or parser threw — both are fine
      }
    }
    if (found.length > 0) return found;
    if (stop && cur === stop) return [];
    const parent = path.dirname(cur);
    if (parent === cur) return [];
    cur = parent;
  }
}

/** Format an install command for a single dep, based on detected ecosystem. */
export function installSuggestion(name: string, ecosystem: Ecosystem): string {
  const parser = getLockfileParser(ecosystem);
  if (!parser) return `# add ${name} to your project (no parser registered for ecosystem "${ecosystem}")`;
  return parser.install(name);
}
