import type { HttpClient } from "../util/index.js";
import { type ExtractedRepo, extractRepo } from "./extractGithub.js";

export type RegistryUrlField =
  | "repository"
  | "source"
  | "source-code"
  | "homepage"
  | "bugs"
  | "registry-search"
  | "module"
  | "other";

export type RegistryCandidate = ExtractedRepo & {
  readonly packageName: string;
  readonly subpath?: string;
  readonly registryUrl?: string;
  readonly matchedUrl?: string;
  readonly urlField: RegistryUrlField;
  readonly confidence: number;
};

export type RegistryProbeResult = RegistryCandidate | ReadonlyArray<RegistryCandidate> | null;

export type RegistryProbe = (
  name: string,
  http: HttpClient,
  timeoutMs?: number,
) => Promise<RegistryProbeResult>;

export type RegistrySearch = (
  query: string,
  http: HttpClient,
  timeoutMs?: number,
) => Promise<ReadonlyArray<RegistryCandidate>>;

export type RegistryDefinition = {
  readonly id: string;
  readonly displayName?: string;
  readonly probe: RegistryProbe;
  readonly search?: RegistrySearch;
};

const registry = new Map<string, RegistryDefinition>();

/**
 * Register a package-manager registry probe. New ecosystems (Maven, NuGet,
 * Swift Package Index) ship as one file under `resolve/registries/`.
 *
 * The `probe` callback should return `{ owner, repo }` when it finds a
 * github.com URL in the manifest, or `null` when nothing matches.
 *
 * @example
 * ```ts
 * import { defineRegistry } from "../defineRegistry.js";
 *
 * export default defineRegistry({
 *   id: "maven",
 *   displayName: "Maven Central",
 *   probe: async (name, http, timeoutMs) => {
 *     const res = await http.json(`https://search.maven.org/solrsearch/select?q=${name}`, { timeoutMs });
 *     return extractGithubFrom(res.data) ?? null;
 *   },
 * });
 * ```
 */
export function defineRegistry(def: RegistryDefinition): RegistryDefinition {
  if (registry.has(def.id)) {
    throw new Error(`registry already registered: ${def.id}`);
  }
  registry.set(def.id, def);
  return def;
}

export function listRegistries(): ReadonlyArray<RegistryDefinition> {
  return [...registry.values()];
}

export function getRegistry(id: string): RegistryDefinition | undefined {
  return registry.get(id);
}

export function candidateFromUrl(input: {
  readonly packageName: string;
  readonly url: string | undefined | null;
  readonly urlField: RegistryUrlField;
  readonly confidence: number;
  readonly registryUrl?: string;
  readonly subpath?: string;
}): RegistryCandidate | null {
  const got = extractRepo(input.url);
  if (!got) return null;
  return {
    ...got,
    packageName: input.packageName,
    ...(input.subpath !== undefined ? { subpath: cleanSubpath(input.subpath) } : {}),
    ...(input.registryUrl !== undefined ? { registryUrl: input.registryUrl } : {}),
    ...(input.url !== undefined && input.url !== null ? { matchedUrl: input.url } : {}),
    urlField: input.urlField,
    confidence: input.confidence,
  };
}

export function normalizeProbeResult(result: RegistryProbeResult): ReadonlyArray<RegistryCandidate> {
  if (!result) return [];
  return Array.isArray(result) ? (result as ReadonlyArray<RegistryCandidate>) : [result as RegistryCandidate];
}

function cleanSubpath(subpath: string): string {
  return subpath.replace(/^\/+/, "").replace(/\/+$/, "");
}
