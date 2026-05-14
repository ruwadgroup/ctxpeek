#!/usr/bin/env node
/**
 * docpilot — single bin entrypoint.
 *
 * Dispatches based on argv:
 *   docpilot                        Start MCP stdio server (default; how MCP
 *                                   clients spawn us via `npx -y docpilot`)
 *   docpilot doctor                 Environment self-check (src/doctor/)
 *   docpilot recipe install <path>  Pre-warm cache from a recipe
 *   docpilot cache status [repo]    Print cache stats
 *   docpilot cache gc               Run garbage collection
 *   docpilot --version              Print version
 *   docpilot --help                 Usage
 *
 * Spec: docs/internals/architecture.md and the design doc §3, §13.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const USAGE = `docpilot — local-first MCP server for GitHub-hosted docs

Usage:
  docpilot                        Start the MCP stdio server (default)
  docpilot doctor                 Environment self-check
  docpilot recipe install <path>  Pre-warm cache from a recipe
  docpilot cache status [repo]    Print cache stats
  docpilot cache gc               Run garbage collection
  docpilot --version              Print version
  docpilot --help                 Show this message
`;

async function runMcpServer(): Promise<void> {
  // TODO(v0.1, day-1): construct McpServer, register tools from src/tools/*,
  // wire fetch strategy, cache, indexer, then connect the stdio transport.
  const _transport = new StdioServerTransport();
  process.stderr.write("docpilot: server skeleton — no tools registered yet\n");
}

async function runCli(argv: ReadonlyArray<string>): Promise<number> {
  const [command] = argv;
  switch (command) {
    case "doctor":
      // TODO(v0.1, week-5): import and run src/doctor/
      process.stdout.write("docpilot doctor: not implemented yet\n");
      return 0;
    case "recipe":
      process.stdout.write("docpilot recipe: not implemented yet\n");
      return 0;
    case "cache":
      process.stdout.write("docpilot cache: not implemented yet\n");
      return 0;
    case "--version":
    case "-v":
      // Version is wired up at build time from package.json.
      process.stdout.write("docpilot 0.0.0\n");
      return 0;
    case "--help":
    case "-h":
      process.stdout.write(USAGE);
      return 0;
    default:
      process.stderr.write(`unknown command: ${command}\n${USAGE}`);
      return 2;
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    await runMcpServer();
    return 0;
  }
  return runCli(args);
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`docpilot: fatal: ${String(err)}\n`);
    process.exit(1);
  },
);
