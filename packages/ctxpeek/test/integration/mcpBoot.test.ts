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

type JsonRpcResponse = {
  jsonrpc?: "2.0";
  id?: number | string | null;
  result?: { tools?: Array<{ name: string }> };
  error?: { code: number; message: string };
};

describe("MCP boot", () => {
  it("registers all 10 tools and responds to tools/list", async () => {
    const child = spawn("node", [SERVER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";
    const waitForResponse = (id: number, timeoutMs: number): Promise<JsonRpcResponse> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `timed out after ${timeoutMs}ms waiting for response id=${id}; buffer so far:\n${buffer.slice(0, 4000)}`,
            ),
          );
        }, timeoutMs);
        const onData = (chunk: Buffer): void => {
          buffer += chunk.toString();
          // JSON-RPC framing: each message is a single line of JSON terminated by \n.
          for (;;) {
            const nlIdx = buffer.indexOf("\n");
            if (nlIdx < 0) return;
            const line = buffer.slice(0, nlIdx).trim();
            buffer = buffer.slice(nlIdx + 1);
            if (!line) continue;
            try {
              const msg = JSON.parse(line) as JsonRpcResponse;
              if (msg.id === id) {
                clearTimeout(timer);
                child.stdout.off("data", onData);
                resolve(msg);
                return;
              }
            } catch {
              // not a complete JSON line — keep buffering
            }
          }
        };
        child.stdout.on("data", onData);
      });

    const send = (msg: Record<string, unknown>): void => {
      child.stdin.write(`${JSON.stringify(msg)}\n`);
    };

    try {
      send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      });
      await waitForResponse(1, 10_000);
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
      const list = await waitForResponse(2, 10_000);

      expect(list.result?.tools?.length).toBe(10);
      const names = (list.result?.tools ?? []).map((t) => t.name).sort();
      expect(names).toEqual([
        "cache_status",
        "changelog",
        "fetch_doc",
        "get_changes",
        "get_issues",
        "list_docs",
        "peek",
        "rate_limits",
        "related_repos",
        "resolve_repo",
      ]);
    } finally {
      child.kill();
    }
  }, 30_000);
});
