#!/usr/bin/env node
/**
 * docpilot-mcp — MCP server entrypoint.
 *
 * Spec: docs/internals/architecture.md and the design doc §3, §13.
 * Transport: stdio. Single Node process. No daemon, no port.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

async function main(): Promise<void> {
  // TODO(v0.1, day-1): construct McpServer, register tools from src/tools/*,
  // wire fetch strategy, cache, indexer, then connect the stdio transport.
  const _transport = new StdioServerTransport();
  process.stderr.write("docpilot-mcp: server skeleton — no tools registered yet\n");
}

main().catch((err: unknown) => {
  process.stderr.write(`docpilot-mcp: fatal: ${String(err)}\n`);
  process.exit(1);
});
