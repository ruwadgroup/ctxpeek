/**
 * Boots the built MCP server, performs an initialize + tools/list round-trip
 * over stdio, and asserts the expected tools are registered.
 *
 * Runs under the integration config (vitest.integration.config.ts) so it
 * only fires on `pnpm test:integration` or scheduled CI jobs. Does not call
 * any external network — just exercises the in-process MCP handshake.
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const SERVER_PATH = path.resolve(__dirname, "../../dist/server.js");

interface JsonRpcResponse {
  jsonrpc?: "2.0";
  id?: number | string | null;
  result?: { tools?: Array<{ name: string }> };
  error?: { code: number; message: string };
}

describe("MCP boot", () => {
  it("registers all 12 tools and responds to tools/list", async () => {
    const child = spawn("node", [SERVER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    const write = (msg: Record<string, unknown>): void => {
      child.stdin.write(`${JSON.stringify(msg)}\n`);
    };
    write({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    });
    await new Promise((r) => setTimeout(r, 400));
    write({ jsonrpc: "2.0", method: "notifications/initialized" });
    await new Promise((r) => setTimeout(r, 200));
    write({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    await new Promise((r) => setTimeout(r, 2500));
    child.kill();
    const lines = stdout.split("\n").filter(Boolean);
    const messages: JsonRpcResponse[] = lines
      .map((l) => {
        try {
          return JSON.parse(l) as JsonRpcResponse;
        } catch {
          return null;
        }
      })
      .filter((m): m is JsonRpcResponse => m !== null);
    const list = messages.find((m) => m.id === 2);
    expect(list?.result?.tools?.length).toBe(12);
    const names = (list?.result?.tools ?? []).map((t) => t.name).sort();
    expect(names).toEqual([
      "cache_status",
      "changelog",
      "doc_quality",
      "fetch_doc",
      "get_changes",
      "get_issues",
      "list_docs",
      "peek",
      "related_repos",
      "resolve_repo",
      "search_all",
      "search_docs",
    ]);
  }, 15_000);
});
