import type { Ecosystem } from "../config.js";

export type PackageManifestDefinition = {
  readonly ecosystem: Ecosystem;
  readonly filenames: ReadonlyArray<string>;
  readonly candidateSubpaths?: (packageName: string) => ReadonlyArray<string>;
  readonly matches: (raw: string, packageName: string) => boolean;
};

const registry = new Map<Ecosystem, PackageManifestDefinition>();

export function definePackageManifest(def: PackageManifestDefinition): PackageManifestDefinition {
  if (registry.has(def.ecosystem)) {
    throw new Error(`package manifest already registered: ${def.ecosystem}`);
  }
  registry.set(def.ecosystem, def);
  return def;
}

export function getPackageManifest(ecosystem: Ecosystem): PackageManifestDefinition | undefined {
  return registry.get(ecosystem);
}

export function listPackageManifests(): ReadonlyArray<PackageManifestDefinition> {
  return [...registry.values()];
}
