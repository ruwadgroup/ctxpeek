// Lockfile / manifest detection — public façade.
import * as fs from "node:fs/promises";
import * as os from "node:os";
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
  let cur = path.resolve(dir);
  const stop = stopAt ? path.resolve(stopAt) : null;
  const home = path.resolve(os.homedir());
  while (true) {
    const found = await readManifestsAt(cur);
    if (found.length > 0) return found;
    if (stop && cur === stop) return [];
    if (cur === home) return [];
    const parent = path.dirname(cur);
    if (parent === cur) return [];
    cur = parent;
  }
}

/**
 * Detect manifests in `dir` and every ancestor up to the filesystem root or
 * home. This is intentionally broader than `detectManifests()` and is used by
 * resolver preflight so a package inside a monorepo still sees root deps.
 */
export async function detectProjectManifests(
  dir: string,
  stopAt?: string,
): Promise<ReadonlyArray<DetectedManifest>> {
  const out: DetectedManifest[] = [];
  const seen = new Set<string>();
  let cur = path.resolve(dir);
  const stop = stopAt ? path.resolve(stopAt) : null;
  const home = path.resolve(os.homedir());
  while (true) {
    for (const manifest of await readManifestsAt(cur)) {
      if (seen.has(manifest.file)) continue;
      seen.add(manifest.file);
      out.push(manifest);
    }
    if (stop && cur === stop) return out;
    if (cur === home) return out;
    const parent = path.dirname(cur);
    if (parent === cur) return out;
    cur = parent;
  }
}

/** Format an install command for a single dep, based on detected ecosystem. */
export function installSuggestion(name: string, ecosystem: Ecosystem): string {
  const parser = getLockfileParser(ecosystem);
  if (!parser) return `# add ${name} to your project (no parser registered for ecosystem "${ecosystem}")`;
  return parser.install(name);
}

async function readManifestsAt(dir: string): Promise<ReadonlyArray<DetectedManifest>> {
  const knownFiles = new Set<string>();
  for (const p of listLockfileParsers()) for (const fn of p.filenames) knownFiles.add(fn);

  const found: DetectedManifest[] = [];
  for (const filename of knownFiles) {
    const file = path.join(dir, filename);
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
  return found;
}
