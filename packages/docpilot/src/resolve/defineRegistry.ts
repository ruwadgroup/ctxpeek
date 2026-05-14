import type { HttpClient } from "../util/index.js";

export type RegistryProbe = (
  name: string,
  http: HttpClient,
  timeoutMs?: number,
) => Promise<{ owner: string; repo: string } | null>;

export type RegistryDefinition = {
  readonly id: string;
  readonly displayName?: string;
  readonly probe: RegistryProbe;
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
