// Configuration loader.
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";
import { readGhToken } from "./util/ghAuth.js";
import { paths as buildPaths, type CtxpeekPaths, defaultPaths, expandHome, parseSize } from "./util/index.js";

export type CtxpeekConfig = {
  readonly paths: CtxpeekPaths;
  readonly cache: {
    readonly dir: string;
    readonly maxSizeBytes: number;
    readonly gcDays: number;
  };
  readonly fetch: {
    readonly preferCdn: boolean;
    readonly concurrentMax: number;
    readonly secondaryBudgetPerMin: number;
    readonly honorRetryAfter: boolean;
    readonly cdnEnabled: boolean;
  };
  readonly auth: {
    readonly tokenEnv: string;
    readonly token: string | undefined;
    readonly tokenSource: "cli" | "env" | "gh" | "none";
    readonly ghAccount: string | undefined;
  };
  readonly resolve: {
    readonly ecosystems: ReadonlyArray<Ecosystem>;
    readonly githubSearchFallback: boolean;
    readonly packageMappings: ReadonlyArray<PackageMapping>;
  };
  readonly experiments: { readonly prewarmFromLockfile: boolean };
  readonly logLevel: "debug" | "info" | "warn" | "error";
};

export type Ecosystem = "npm" | "pypi" | "crates" | "go" | "rubygems" | "packagist" | "hex";
export type PackageMapping = {
  readonly name: string;
  readonly spec: string;
  readonly ecosystem: Ecosystem | undefined;
};

const ECOSYSTEMS = ["npm", "pypi", "crates", "go", "rubygems", "packagist", "hex"] as const;

const FileSchema = z
  .object({
    cache: z
      .object({
        dir: z.string().optional(),
        max_size: z.string().optional(),
        gc_days: z.number().int().positive().optional(),
      })
      .optional(),
    fetch: z
      .object({
        prefer_cdn: z.boolean().optional(),
        concurrent_max: z.number().int().positive().optional(),
        secondary_budget: z.number().int().positive().optional(),
        honor_retry_after: z.boolean().optional(),
        cdn_enabled: z.boolean().optional(),
      })
      .optional(),
    auth: z
      .object({
        github_token_env: z.string().optional(),
      })
      .optional(),
    resolve: z
      .object({
        ecosystems: z.array(z.enum(ECOSYSTEMS)).optional(),
        github_search_fallback: z.boolean().optional(),
      })
      .optional(),
    package: z
      .array(
        z.object({
          name: z.string().min(1),
          spec: z.string().min(1),
          ecosystem: z.enum(ECOSYSTEMS).optional(),
        }),
      )
      .optional(),
    experiments: z
      .object({
        prewarm_from_lockfile: z.boolean().optional(),
      })
      .optional(),
    log: z
      .object({
        level: z.enum(["debug", "info", "warn", "error"]).optional(),
      })
      .optional(),
  })
  .passthrough();

type FileConfig = z.infer<typeof FileSchema>;

export type CliOverrides = {
  readonly cacheDir?: string;
  readonly token?: string;
  readonly noCdn?: boolean;
  readonly cdnOnly?: boolean;
  readonly logLevel?: "debug" | "info" | "warn" | "error";
  readonly configFile?: string;
};

export async function loadConfig(
  argv: ReadonlyArray<string> = [],
  env: NodeJS.ProcessEnv = process.env,
): Promise<CtxpeekConfig> {
  const cli = parseCliOverrides(argv);

  const userConfigPath = path.join(
    env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
    "ctxpeek",
    "config.toml",
  );
  const userFile = await safeReadToml(userConfigPath);
  const repoFile = cli.configFile
    ? await safeReadToml(cli.configFile)
    : await findAndReadRepoConfig(process.cwd());
  const merged = mergeFileConfigs(userFile, repoFile);

  const tokenEnv = merged.auth?.github_token_env ?? "GITHUB_TOKEN";

  // Token resolution order:
  //   1. --token CLI flag
  //   2. $GITHUB_TOKEN env var (or whatever auth.github_token_env names)
  //   3. `gh auth token` if the `gh` CLI is installed + logged in
  //   4. None (anonymous, 60 req/hr REST per IP)
  let token: string | undefined;
  let tokenSource: "cli" | "env" | "gh" | "none" = "none";
  let ghAccount: string | undefined;
  if (cli.token) {
    token = cli.token;
    tokenSource = "cli";
  } else if (env[tokenEnv]) {
    token = env[tokenEnv];
    tokenSource = "env";
  } else if (env.GITHUB_TOKEN) {
    token = env.GITHUB_TOKEN;
    tokenSource = "env";
  } else {
    const fromGh = readGhToken("github.com");
    if (fromGh) {
      token = fromGh.token;
      ghAccount = fromGh.account;
      tokenSource = "gh";
    }
  }

  const cacheDir = cli.cacheDir ?? merged.cache?.dir ?? defaultPaths().cache;
  const base = defaultPaths();
  const paths = cli.cacheDir || merged.cache?.dir ? buildPaths(cacheDir, base.config, base.logs) : base;

  const cdnEnabled = !cli.noCdn && (merged.fetch?.cdn_enabled ?? true);
  const preferCdn = cli.cdnOnly || (merged.fetch?.prefer_cdn ?? !token);

  return {
    paths,
    cache: {
      dir: paths.cache,
      maxSizeBytes: merged.cache?.max_size ? parseSize(merged.cache.max_size) : 1024 * 1024 * 1024,
      gcDays: merged.cache?.gc_days ?? 14,
    },
    fetch: {
      preferCdn,
      concurrentMax: merged.fetch?.concurrent_max ?? 8,
      secondaryBudgetPerMin: merged.fetch?.secondary_budget ?? 60,
      honorRetryAfter: merged.fetch?.honor_retry_after ?? true,
      cdnEnabled,
    },
    auth: {
      tokenEnv,
      token,
      tokenSource,
      ghAccount,
    },
    resolve: {
      ecosystems: (merged.resolve?.ecosystems ?? [...ECOSYSTEMS]) as Ecosystem[],
      githubSearchFallback: merged.resolve?.github_search_fallback ?? true,
      packageMappings: (merged.package ?? []).map((mapping) => ({
        name: mapping.name,
        spec: mapping.spec,
        ecosystem: mapping.ecosystem,
      })),
    },
    experiments: {
      prewarmFromLockfile: merged.experiments?.prewarm_from_lockfile ?? false,
    },
    logLevel:
      cli.logLevel ??
      merged.log?.level ??
      (env.CTXPEEK_LOG_LEVEL as CtxpeekConfig["logLevel"] | undefined) ??
      "info",
  };
}

export function parseCliOverrides(argv: ReadonlyArray<string>): CliOverrides {
  const out: {
    cacheDir?: string;
    token?: string;
    noCdn?: boolean;
    cdnOnly?: boolean;
    logLevel?: "debug" | "info" | "warn" | "error";
    configFile?: string;
  } = {};
  function set<K extends keyof typeof out>(key: K, value: (typeof out)[K] | undefined): void {
    if (value !== undefined) out[key] = value;
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--token") set("token", argv[++i]);
    else if (arg.startsWith("--token=")) set("token", arg.slice("--token=".length));
    else if (arg === "--cache-dir") set("cacheDir", argv[++i]);
    else if (arg.startsWith("--cache-dir=")) set("cacheDir", arg.slice("--cache-dir=".length));
    else if (arg === "--no-cdn") out.noCdn = true;
    else if (arg === "--cdn-only") out.cdnOnly = true;
    else if (arg === "--log-level") set("logLevel", argv[++i] as typeof out.logLevel);
    else if (arg.startsWith("--log-level="))
      set("logLevel", arg.slice("--log-level=".length) as typeof out.logLevel);
    else if (arg === "--config") set("configFile", argv[++i]);
    else if (arg.startsWith("--config=")) set("configFile", arg.slice("--config=".length));
  }
  return out;
}

async function findAndReadRepoConfig(start: string): Promise<FileConfig | null> {
  const home = os.homedir();
  let cur = path.resolve(start);
  while (true) {
    const candidate = path.join(cur, ".ctxpeek.toml");
    const exists = await fileExists(candidate);
    if (exists) return safeReadToml(candidate);
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    if (cur === home) return null;
    cur = parent;
  }
}

async function safeReadToml(filePath: string): Promise<FileConfig | null> {
  try {
    const raw = await fs.readFile(expandHome(filePath), "utf8");
    const parsed = parseToml(raw);
    return FileSchema.parse(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function mergeFileConfigs(...sources: ReadonlyArray<FileConfig | null>): FileConfig {
  const out: FileConfig = {};
  for (const s of sources) {
    if (!s) continue;
    for (const [k, v] of Object.entries(s)) {
      if (v === undefined) continue;
      const prev = (out as Record<string, unknown>)[k];
      if (k === "package" && Array.isArray(prev) && Array.isArray(v)) {
        (out as Record<string, unknown>)[k] = mergePackageMappings(prev, v);
      } else if (
        prev &&
        typeof prev === "object" &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        !Array.isArray(prev)
      ) {
        (out as Record<string, unknown>)[k] = {
          ...(prev as object),
          ...(v as object),
        };
      } else {
        (out as Record<string, unknown>)[k] = v;
      }
    }
  }
  return out;
}

function mergePackageMappings(
  base: ReadonlyArray<unknown>,
  overlay: ReadonlyArray<unknown>,
): ReadonlyArray<unknown> {
  const byName = new Map<string, unknown>();
  for (const mapping of base) {
    byName.set(packageMappingKey(mapping), mapping);
  }
  for (const mapping of overlay) {
    byName.set(packageMappingKey(mapping), mapping);
  }
  return [...byName.values()];
}

function packageMappingKey(mapping: unknown): string {
  if (!mapping || typeof mapping !== "object") return "";
  const name = (mapping as { name?: unknown }).name;
  return typeof name === "string" ? normalizePackageMappingName(name) : "";
}

function normalizePackageMappingName(name: string): string {
  return name.toLowerCase().replace(/[._-]/g, "");
}
