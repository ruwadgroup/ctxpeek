import type { HttpClient, Logger } from "../util/index.js";
import type { ForgeClient } from "./forgeClient.js";
import type { RateLimiter } from "./ratelimit.js";

export type ForgeBootContext = {
  readonly http: HttpClient;
  readonly limiter: RateLimiter;
  readonly userAgent: string;
  readonly logger: Logger;
  readonly token: string | undefined;
};

export type ForgeDefinition = {
  readonly id: string;
  readonly displayName: string;
  readonly aliases?: ReadonlyArray<string>;
  readonly tokenEnv?: string;
  readonly create: (ctx: ForgeBootContext) => ForgeClient;
};

const registry = new Map<string, ForgeDefinition>();
const aliasMap = new Map<string, string>();

/**
 * Register a git-forge plug-in. New forges (Codeberg, sourcehut, Gitea, …)
 * land as one file under `fetch/forges/`.
 *
 * @example
 * ```ts
 * import { defineForge } from "../defineForge.js";
 *
 * export default defineForge({
 *   id: "codeberg",
 *   displayName: "Codeberg",
 *   aliases: ["cb"],
 *   tokenEnv: "CODEBERG_TOKEN",
 *   create: (ctx) => makeCodebergClient(ctx),
 * });
 * ```
 */
export function defineForge(def: ForgeDefinition): ForgeDefinition {
  if (registry.has(def.id)) {
    throw new Error(`forge already registered: ${def.id}`);
  }
  registry.set(def.id, def);
  aliasMap.set(def.id, def.id);
  for (const alias of def.aliases ?? []) {
    aliasMap.set(alias, def.id);
  }
  return def;
}

export function listForgeDefinitions(): ReadonlyArray<ForgeDefinition> {
  return [...registry.values()];
}

export function getForgeDefinition(id: string): ForgeDefinition | undefined {
  return registry.get(id);
}

/** Resolve a repo-spec prefix (e.g. `gl`) to a canonical forge id (`gitlab`). */
export function resolveForgeAlias(alias: string): string | undefined {
  return aliasMap.get(alias);
}

export function snapshotAliasMap(): ReadonlyMap<string, string> {
  return new Map(aliasMap);
}
