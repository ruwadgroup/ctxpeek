import { z } from "zod";
import { fetchBlob } from "../fetch/strategy.js";
import { renderFrontmatter } from "../format/frontmatter.js";
import { fetchContextFrom, resolveSnapshot, type ToolContext } from "./context.js";

export const peekInput = z.object({
  repo: z.string(),
  path: z.string(),
  n: z.number().int().positive().default(40),
});

export type PeekInput = z.infer<typeof peekInput>;

export function buildPeekTool(ctx: ToolContext) {
  return async (input: PeekInput): Promise<string> => {
    const resolved = await resolveSnapshot(ctx, input.repo);
    const fctx = fetchContextFrom(ctx);
    const result = await fetchBlob(
      fctx,
      resolved.owner,
      resolved.repo,
      resolved.snapshot.commitSha,
      input.path.replace(/^\/+/, ""),
      {
        preferCdn: ctx.config.fetch.preferCdn,
        cdnEnabled: ctx.config.fetch.cdnEnabled,
      },
      resolved.forge,
    );
    const text = Buffer.from(result.bytes).toString("utf8");
    const lines = text.split(/\r?\n/);
    const head = lines.slice(0, input.n).join("\n");
    const fm = renderFrontmatter({
      repo: `${resolved.owner}/${resolved.repo}`,
      ref: resolved.snapshot.requestedRef,
      commit: resolved.snapshot.commitSha.slice(0, 7),
      path: input.path,
      size: result.bytes.byteLength,
    });
    return [
      `# Peek: ${resolved.owner}/${resolved.repo}@${resolved.snapshot.requestedRef}:${input.path} (first ${input.n} of ${lines.length} lines / ${result.bytes.byteLength} bytes total)`,
      "",
      fm,
      "",
      head,
    ].join("\n");
  };
}
