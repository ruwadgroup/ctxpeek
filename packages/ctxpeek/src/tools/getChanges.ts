import { z } from "zod";
import { pickForge } from "../fetch/forgeClient.js";
import { fetchBlob } from "../fetch/strategy.js";
import { parseRepoSpec } from "../util/repoSpec.js";
import { fetchContextFrom, type ToolContext } from "./context.js";

export const getChangesInput = z.object({
  repo: z.string(),
  path: z.string(),
  from_ref: z.string(),
  to_ref: z.string(),
});

export type GetChangesInput = z.infer<typeof getChangesInput>;

export function buildGetChangesTool(ctx: ToolContext) {
  return async (input: GetChangesInput): Promise<string> => {
    const spec = parseRepoSpec(input.repo);
    const client = pickForge(ctx.forges, spec.forge);
    const [fromSha, toSha] = await Promise.all([
      client.resolveRef(spec.owner, spec.repo, input.from_ref),
      client.resolveRef(spec.owner, spec.repo, input.to_ref),
    ]);
    const fctx = fetchContextFrom(ctx);
    const [a, b] = await Promise.all([
      fetchBlob(
        fctx,
        spec.owner,
        spec.repo,
        fromSha.sha,
        input.path,
        {
          preferCdn: ctx.config.fetch.preferCdn,
          cdnEnabled: ctx.config.fetch.cdnEnabled,
        },
        spec.forge,
      ),
      fetchBlob(
        fctx,
        spec.owner,
        spec.repo,
        toSha.sha,
        input.path,
        {
          preferCdn: ctx.config.fetch.preferCdn,
          cdnEnabled: ctx.config.fetch.cdnEnabled,
        },
        spec.forge,
      ),
    ]);
    const aText = Buffer.from(a.bytes).toString("utf8");
    const bText = Buffer.from(b.bytes).toString("utf8");
    if (aText === bText) {
      return [
        `# Diff: ${spec.owner}/${spec.repo}/${input.path}  ${input.from_ref}…${input.to_ref}`,
        "",
        "_No changes._",
      ].join("\n");
    }
    const diff = unifiedDiff(aText, bText, input.path, input.from_ref, input.to_ref);
    return [
      `# Diff: ${spec.owner}/${spec.repo}/${input.path}  ${input.from_ref}…${input.to_ref}`,
      "",
      "```diff",
      diff,
      "```",
    ].join("\n");
  };
}

/**
 * Tiny LCS-based unified diff renderer (3-line context). Suitable for
 * doc-sized files; not a replacement for `git diff` on multi-MB blobs.
 */
function unifiedDiff(a: string, b: string, label: string, fromRef: string, toRef: string): string {
  const aLines = a.split(/\r?\n/);
  const bLines = b.split(/\r?\n/);
  const lcs = buildLcs(aLines, bLines);
  const ops: Array<{
    kind: "ctx" | "add" | "del";
    line: string;
    aIdx?: number;
    bIdx?: number;
  }> = [];

  let i = 0;
  let j = 0;
  for (const step of lcs) {
    while (i < step.aIdx) ops.push({ kind: "del", line: aLines[i++] ?? "" });
    while (j < step.bIdx) ops.push({ kind: "add", line: bLines[j++] ?? "" });
    ops.push({ kind: "ctx", line: aLines[step.aIdx] ?? "" });
    i = step.aIdx + 1;
    j = step.bIdx + 1;
  }
  while (i < aLines.length) ops.push({ kind: "del", line: aLines[i++] ?? "" });
  while (j < bLines.length) ops.push({ kind: "add", line: bLines[j++] ?? "" });

  const hunks: string[] = [];
  hunks.push(`--- a/${label}\t(${fromRef})`);
  hunks.push(`+++ b/${label}\t(${toRef})`);
  let aLineNum = 1;
  let bLineNum = 1;
  let buffer: string[] = [];
  let aStart = 0;
  let bStart = 0;
  let aCount = 0;
  let bCount = 0;
  let pendingChange = false;

  function flush(): void {
    if (buffer.length === 0) return;
    hunks.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`);
    hunks.push(...buffer);
    buffer = [];
    aStart = 0;
    bStart = 0;
    aCount = 0;
    bCount = 0;
    pendingChange = false;
  }

  for (const op of ops) {
    if (op.kind === "ctx") {
      if (!pendingChange) {
        aLineNum += 1;
        bLineNum += 1;
        continue;
      }
      buffer.push(` ${op.line}`);
      aCount += 1;
      bCount += 1;
      aLineNum += 1;
      bLineNum += 1;
    } else if (op.kind === "del") {
      if (!pendingChange) {
        aStart = aLineNum;
        bStart = bLineNum;
        pendingChange = true;
      }
      buffer.push(`-${op.line}`);
      aCount += 1;
      aLineNum += 1;
    } else {
      if (!pendingChange) {
        aStart = aLineNum;
        bStart = bLineNum;
        pendingChange = true;
      }
      buffer.push(`+${op.line}`);
      bCount += 1;
      bLineNum += 1;
    }
  }
  flush();
  if (hunks.length === 2) hunks.push("@@ no textual diff @@");
  return hunks.join("\n");
}

function buildLcs(a: ReadonlyArray<string>, b: ReadonlyArray<string>): Array<{ aIdx: number; bIdx: number }> {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array.from<number>({ length: m + 1 }).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) (dp[i] ?? [])[j] = ((dp[i + 1] ?? [])[j + 1] ?? 0) + 1;
      else (dp[i] ?? [])[j] = Math.max((dp[i + 1] ?? [])[j] ?? 0, (dp[i] ?? [])[j + 1] ?? 0);
    }
  }
  const out: Array<{ aIdx: number; bIdx: number }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ aIdx: i, bIdx: j });
      i += 1;
      j += 1;
    } else if (((dp[i + 1] ?? [])[j] ?? 0) >= ((dp[i] ?? [])[j + 1] ?? 0)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return out;
}
