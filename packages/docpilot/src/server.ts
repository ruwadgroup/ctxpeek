#!/usr/bin/env node
import { DocpilotError } from "@docpilot/core";
// docpilot — single bin entrypoint. With no args, runs the MCP stdio server.
// Subcommands: `doctor`, `warm`, `recipe install`, `cache status|gc`. See USAGE.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape, z } from "zod";
import { createBlobStore } from "./cache/blobs.js";
import { createEtagStore } from "./cache/etag.js";
import { runGc } from "./cache/gc.js";
import { createRefStore } from "./cache/refs.js";
import { RepoMetaCache } from "./cache/repoMeta.js";
import { type DocpilotConfig, loadConfig } from "./config.js";
import { listForgeDefinitions } from "./fetch/defineForge.js";
import type { ForgeRegistry } from "./fetch/forgeClient.js";
import { BUILT_IN_FORGES } from "./fetch/forges/index.js";
import { GithubGraphqlClient } from "./fetch/githubGraphql.js";
import { GithubRestClient } from "./fetch/githubRest.js";
import { JsDelivrClient } from "./fetch/jsdelivr.js";
import { RateLimiter } from "./fetch/ratelimit.js";
import { createLogger, ensureDirs, HttpClient, type Logger, noopLogger } from "./util/index.js";

// Each forge module registers itself on import; reference the array so it
// remains "used" from the linter's perspective.
void BUILT_IN_FORGES;

import { renderDoctorReport, runDoctor } from "./doctor.js";
import { installRecipe, loadRecipe, renderRecipeReport } from "./recipes.js";
import {
  buildCacheStatusTool,
  buildChangelogTool,
  buildDocQualityTool,
  buildFetchDocTool,
  buildGetChangesTool,
  buildGetIssuesTool,
  buildListDocsTool,
  buildPeekTool,
  buildRelatedReposTool,
  buildResolveRepoTool,
  buildSearchAllTool,
  buildSearchDocsTool,
  cacheStatusInput,
  changelogInput,
  docQualityInput,
  fetchDocInput,
  getChangesInput,
  getIssuesInput,
  listDocsInput,
  peekInput,
  relatedReposInput,
  resolveRepoInput,
  searchAllInput,
  searchDocsInput,
  type ToolContext,
} from "./tools/index.js";

export const DOCPILOT_VERSION = "0.1.0";

const USAGE = `docpilot ${DOCPILOT_VERSION} — local-first MCP server for GitHub-hosted docs

Usage:
  docpilot                          Start the MCP stdio server (default)
  docpilot doctor                   Environment self-check
  docpilot warm <spec...>           Pre-pull trees + indexes for repos or a recipe
  docpilot recipe install <path>    Pre-warm cache from a recipe (alias for "warm")
  docpilot cache status [repo]      Print cache stats
  docpilot cache gc                 Run garbage collection
  docpilot --version                Print version
  docpilot --help                   Show this message

Common flags (server + subcommands):
  --token <pat>           GitHub PAT (also reads GITHUB_TOKEN by default)
  --cache-dir <path>      Override cache directory
  --no-cdn                Disable jsDelivr CDN fallback
  --cdn-only              Always prefer CDN even when a PAT is present
  --config <path>         Use a specific .docpilot.toml
  --log-level <lvl>       debug | info | warn | error  (default: info)
`;

/** Build the full service context shared between server + CLI subcommands. */
export async function buildContext(argv: ReadonlyArray<string> = [], logger?: Logger): Promise<ToolContext> {
  const config = await loadConfig(argv);
  await ensureDirs(config.paths);
  const log = logger ?? createLogger(config.logLevel, { stream: process.stderr });

  const limiter = new RateLimiter(config.fetch.concurrentMax, config.fetch.secondaryBudgetPerMin);
  await limiter.hydrate(config.paths.limiterStateFile);
  const http = new HttpClient({ userAgent: `docpilot/${DOCPILOT_VERSION}` });
  const repoMeta = new RepoMetaCache(config.paths.repoMetaFile);
  const rest = new GithubRestClient({
    token: config.auth.token,
    userAgent: `docpilot/${DOCPILOT_VERSION}`,
    limiter,
    http,
    repoMeta,
  });
  const graphql = config.auth.token
    ? new GithubGraphqlClient({
        token: config.auth.token,
        userAgent: `docpilot/${DOCPILOT_VERSION}`,
        limiter,
        http,
      })
    : null;
  const cdn = new JsDelivrClient(http);
  const blobs = createBlobStore(config.paths.blobs);
  const refs = createRefStore(config.paths.refs);
  const etags = createEtagStore(config.paths.etagMapFile);
  const forges: ForgeRegistry = {};
  for (const def of listForgeDefinitions()) {
    const token = def.tokenEnv ? process.env[def.tokenEnv] : undefined;
    forges[def.id] = def.create({
      http,
      limiter,
      userAgent: `docpilot/${DOCPILOT_VERSION}`,
      logger: log,
      token,
    });
  }
  return {
    config,
    logger: log,
    rest,
    forges,
    graphql,
    cdn,
    limiter,
    blobs,
    refs,
    etags,
    http,
    repoMeta,
  };
}

const SERVER_INSTRUCTIONS = `Fetch version-pinned docs for any library, framework, or open-source package. Flow: \`resolve_repo\` → \`search_docs\` (path-based, fast) → \`fetch_doc\`. Do not grep \`node_modules\` or shell out to \`npm view\`/\`pip show\` for versions — omit the ref and docpilot pins to the default branch. Skip for general programming questions unrelated to a specific library.`;

export async function runMcpServer(argv: ReadonlyArray<string> = []): Promise<void> {
  const ctx = await buildContext(argv);
  const server = new McpServer(
    { name: "docpilot", version: DOCPILOT_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  registerToolWrapper(server, "resolve_repo", resolveRepoInput, {
    description:
      "Resolve a library/package name to owner/repo. Manifest-aware: prefers packages already in the cwd lockfile. If `ambiguous: true` or the result looks wrong, re-call with `force_refresh: true` or pick from `alternatives[]`.",
    handler: buildResolveRepoTool(ctx),
    transform: (out) => {
      const result: CallToolResult = {
        content: [{ type: "text", text: out.markdown }],
      };
      if (out.structured)
        result.structuredContent = {
          ...out.structured,
        } as Record<string, unknown>;
      return result;
    },
  });

  registerSimpleTool(server, "list_docs", listDocsInput, {
    description:
      "List doc files as a tree. Input: 'owner/repo[@ref][#subpath]'. Omit `@ref` for the default branch.",
    handler: buildListDocsTool(ctx),
  });

  registerSimpleTool(server, "fetch_doc", fetchDocInput, {
    description:
      "Fetch a doc file at a pinned commit. Supports `lines: [start, end]` and `head_bytes` for partial reads.",
    handler: buildFetchDocTool(ctx),
  });

  registerSimpleTool(server, "search_docs", searchDocsInput, {
    description:
      "Path-based search across a library's doc files. Fast (~1s, no content fetched). Best first call for 'how do I X with Y' questions — follow up with `fetch_doc` on a result path.",
    handler: buildSearchDocsTool(ctx),
  });

  registerSimpleTool(server, "peek", peekInput, {
    description: "First N lines of a doc file. Cheaper than `fetch_doc` for a quick look.",
    handler: buildPeekTool(ctx),
  });

  registerSimpleTool(server, "get_changes", getChangesInput, {
    description: "Unified diff for one file across two refs (e.g. v14.2.0 vs v15.0.0).",
    handler: buildGetChangesTool(ctx),
  });

  registerSimpleTool(server, "doc_quality", docQualityInput, {
    description:
      "Scorecard for a repo's docs (llms.txt, README, framework nav, freshness). Use before relying on a poorly-documented repo.",
    handler: buildDocQualityTool(ctx),
  });

  registerSimpleTool(server, "cache_status", cacheStatusInput, {
    description: "On-disk cache state. Pass `{ repo: 'owner/repo' }` for per-repo breakdown.",
    handler: buildCacheStatusTool(ctx),
  });

  registerSimpleTool(server, "related_repos", relatedReposInput, {
    description: "Find peer libraries via github.com links in the repo's README/llms.txt.",
    handler: buildRelatedReposTool(ctx),
  });

  registerSimpleTool(server, "changelog", changelogInput, {
    description: "CHANGELOG entries between two refs (e.g. v14.0.0 → v15.0.0).",
    handler: buildChangelogTool(ctx),
  });

  registerSimpleTool(server, "get_issues", getIssuesInput, {
    description: "Search a repo's issues/PRs matching a query. Opt-in per call (separate rate-limit bucket).",
    handler: buildGetIssuesTool(ctx),
  });

  registerSimpleTool(server, "search_all", searchAllInput, {
    description:
      "Fan-out search across multiple repos. Pass `repos: [...]` or `from_lockfile: true` to use the cwd's deps.",
    handler: buildSearchAllTool(ctx),
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  ctx.logger.info("docpilot: MCP stdio server ready", {
    tools: 12,
    version: DOCPILOT_VERSION,
  });
  await waitForServerClose(server);
}

function waitForServerClose(server: McpServer): Promise<void> {
  return new Promise<void>((resolve) => {
    const underlying = server.server;
    underlying.onclose = () => resolve();
    process.stdin.on("end", () => resolve());
    process.stdin.on("close", () => resolve());
  });
}

function registerSimpleTool<S extends z.ZodObject<ZodRawShape>>(
  server: McpServer,
  name: string,
  schema: S,
  opts: { description: string; handler: (input: z.infer<S>) => Promise<string> },
): void {
  registerToolWrapper(server, name, schema, {
    description: opts.description,
    handler: opts.handler,
    transform: (text) => ({ content: [{ type: "text", text }] }),
  });
}

function registerToolWrapper<S extends z.ZodObject<ZodRawShape>, R>(
  server: McpServer,
  name: string,
  schema: S,
  opts: {
    description: string;
    handler: (input: z.infer<S>) => Promise<R>;
    transform: (out: R) => CallToolResult;
  },
): void {
  const raw = schema.shape as z.ZodRawShape;
  server.registerTool(
    name,
    {
      description: opts.description,
      inputSchema: raw,
    },
    async (input: unknown): Promise<CallToolResult> => {
      try {
        const parsed = schema.parse(input);
        const out = await opts.handler(parsed);
        return opts.transform(out);
      } catch (err) {
        return errorResult(name, err);
      }
    },
  );
}

function errorResult(toolName: string, err: unknown): CallToolResult {
  const message =
    err instanceof DocpilotError
      ? `**${toolName} failed (${err.code})**\n\n${err.message}`
      : err instanceof Error
        ? `**${toolName} failed**\n\n${err.message}`
        : `**${toolName} failed**\n\n${String(err)}`;
  return { content: [{ type: "text", text: message }], isError: true };
}

async function runCli(argv: ReadonlyArray<string>): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case "doctor": {
      const report = await runDoctor(rest);
      process.stdout.write(`${renderDoctorReport(report)}\n`);
      return report.ok ? 0 : 1;
    }
    case "warm":
      return runWarmCommand(rest);
    case "recipe":
      return runRecipeCommand(rest);
    case "cache":
      return runCacheCommand(rest);
    case "--version":
    case "-v":
      process.stdout.write(`docpilot ${DOCPILOT_VERSION}\n`);
      return 0;
    case "--help":
    case "-h":
      process.stdout.write(USAGE);
      return 0;
    default:
      process.stderr.write(`unknown command: ${String(command)}\n${USAGE}`);
      return 2;
  }
}

async function runWarmCommand(args: ReadonlyArray<string>): Promise<number> {
  const positional = args.filter((a) => !a.startsWith("--"));
  if (positional.length === 0) {
    process.stderr.write("usage: docpilot warm <recipe.toml | owner/repo[@ref]...>\n");
    return 2;
  }
  const ctx = await buildContext(args, noopLogger);
  const recipeLike = positional.find((p) => p.endsWith(".toml"));
  let recipe: {
    repos: ReadonlyArray<{ spec: string; alias: string | undefined }>;
  };
  if (recipeLike) {
    recipe = await loadRecipe(recipeLike);
  } else {
    recipe = { repos: positional.map((spec) => ({ spec, alias: undefined })) };
  }
  const results = await installRecipe(ctx, recipe);
  process.stdout.write(`${renderRecipeReport(results)}\n`);
  return results.every((r) => r.status === "ok") ? 0 : 1;
}

async function runRecipeCommand(args: ReadonlyArray<string>): Promise<number> {
  const [sub, ...rest] = args;
  if (sub !== "install") {
    process.stderr.write("usage: docpilot recipe install <path-to-recipe.toml>\n");
    return 2;
  }
  const file = rest.find((a) => !a.startsWith("--"));
  if (!file) {
    process.stderr.write("error: recipe install needs a path argument\n");
    return 2;
  }
  const ctx = await buildContext(rest, noopLogger);
  const recipe = await loadRecipe(file);
  const results = await installRecipe(ctx, recipe);
  process.stdout.write(`${renderRecipeReport(results)}\n`);
  return results.every((r) => r.status === "ok") ? 0 : 1;
}

async function runCacheCommand(args: ReadonlyArray<string>): Promise<number> {
  const [sub, ...rest] = args;
  const ctx = await buildContext(rest, noopLogger);
  switch (sub) {
    case "status": {
      const repoArg = rest.find((a) => !a.startsWith("--"));
      const handler = buildCacheStatusTool(ctx);
      const result = await handler(repoArg ? { repo: repoArg } : {});
      process.stdout.write(`${result}\n`);
      return 0;
    }
    case "gc": {
      const report = await runGc(ctx.config.paths.blobs, ctx.blobs, ctx.refs, {
        maxSizeBytes: ctx.config.cache.maxSizeBytes,
        maxAgeDays: ctx.config.cache.gcDays,
      });
      process.stdout.write(
        `GC: evicted ${report.evicted} entries, freed ${report.freedBytes} bytes; ${report.remainingBytes} bytes remain.\n`,
      );
      return 0;
    }
    default:
      process.stderr.write("usage: docpilot cache <status|gc> [repo]\n");
      return 2;
  }
}

/** Re-export for tests / programmatic use. */
export type { DocpilotConfig };

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    await runMcpServer();
    return 0;
  }
  const KNOWN = new Set(["doctor", "recipe", "cache", "warm", "--help", "-h", "--version", "-v"]);
  if (args[0] && !args[0].startsWith("--") && !KNOWN.has(args[0])) {
    return runCli(args);
  }
  if (args[0] === "--version" || args[0] === "-v" || args[0] === "--help" || args[0] === "-h") {
    return runCli(args);
  }
  if (args[0] === "doctor" || args[0] === "recipe" || args[0] === "cache" || args[0] === "warm") {
    return runCli(args);
  }
  // Anything else (e.g. --token foo) → server with extra flags
  await runMcpServer(args);
  return 0;
}

const isMain =
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1] ?? ""));
if (isMain) {
  main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      process.stderr.write(`docpilot: fatal: ${String(err)}\n`);
      process.exit(1);
    },
  );
}
