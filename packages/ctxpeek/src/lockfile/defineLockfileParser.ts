export type LockedDep = {
  readonly name: string;
  readonly version: string | undefined;
  readonly ecosystem: string;
  readonly direct: boolean;
};

export type LockfileParserDefinition = {
  readonly ecosystem: string;
  readonly filenames: ReadonlyArray<string>;
  readonly parse: (raw: string, filename: string) => ReadonlyArray<Omit<LockedDep, "ecosystem">>;
  readonly install: (name: string) => string;
};

const registry = new Map<string, LockfileParserDefinition>();
const filenameIndex = new Map<string, LockfileParserDefinition>();

/**
 * Register a lockfile parser for a new language. Adding Swift, Dart, .NET
 * is one new file under `lockfile/parsers/`.
 *
 * @example
 * ```ts
 * import { defineLockfileParser } from "../defineLockfileParser.js";
 *
 * export default defineLockfileParser({
 *   ecosystem: "swift",
 *   filenames: ["Package.swift"],
 *   install: (name) => `swift package add ${name}`,
 *   parse: (raw) => parsePackageSwift(raw),
 * });
 * ```
 */
export function defineLockfileParser(def: LockfileParserDefinition): LockfileParserDefinition {
  if (registry.has(def.ecosystem)) {
    throw new Error(`lockfile parser already registered: ${def.ecosystem}`);
  }
  registry.set(def.ecosystem, def);
  for (const filename of def.filenames) {
    if (filenameIndex.has(filename)) {
      throw new Error(
        `lockfile filename collision: ${filename} (already claimed by ${filenameIndex.get(filename)?.ecosystem})`,
      );
    }
    filenameIndex.set(filename, def);
  }
  return def;
}

export function listLockfileParsers(): ReadonlyArray<LockfileParserDefinition> {
  return [...registry.values()];
}

export function getLockfileParser(ecosystem: string): LockfileParserDefinition | undefined {
  return registry.get(ecosystem);
}

export function getParserForFilename(filename: string): LockfileParserDefinition | undefined {
  return filenameIndex.get(filename);
}
