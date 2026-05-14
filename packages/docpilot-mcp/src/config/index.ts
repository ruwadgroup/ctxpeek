/**
 * Configuration loader.
 *
 * Discovery (highest precedence first), §12.1:
 *   1. CLI args
 *   2. .docpilot.toml in cwd or any ancestor up to $HOME
 *   3. ~/.config/docpilot/config.toml
 *   4. Env vars
 *   5. Built-in defaults
 */
export interface DocpilotConfig {
  readonly cache: { dir: string; maxSizeBytes: number; gcDays: number };
  readonly fetch: {
    preferCdn: boolean;
    concurrentMax: number;
    secondaryBudgetPerMin: number;
    honorRetryAfter: boolean;
  };
  readonly auth: { tokenEnv: string };
  readonly resolve: { ecosystems: ReadonlyArray<string>; githubSearchFallback: boolean };
  readonly experiments: { prewarmFromLockfile: boolean };
}

export async function loadConfig(_argv: ReadonlyArray<string>): Promise<DocpilotConfig> {
  // TODO(v0.1, day-1): merge sources in precedence order, validate with zod
  throw new Error("not implemented");
}
