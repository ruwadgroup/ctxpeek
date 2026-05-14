import { z } from "zod";
import { fetchBlob } from "../fetch/strategy.js";
import { approxTokens, renderFrontmatter } from "../format/frontmatter.js";
import { fetchContextFrom, resolveSnapshot, type ToolContext } from "./context.js";

export const fetchDocInput = z.object({
  repo: z.string(),
  path: z.string(),
  lines: z.tuple([z.number().int().nonnegative(), z.number().int().positive()]).optional(),
  head_bytes: z.number().int().positive().optional(),
});

export type FetchDocInput = z.infer<typeof fetchDocInput>;

const LARGE_FILE_THRESHOLD = 200 * 1024;

export function buildFetchDocTool(ctx: ToolContext) {
  return async (input: FetchDocInput): Promise<string> => {
    const resolved = await resolveSnapshot(ctx, input.repo);
    const fctx = fetchContextFrom(ctx);
    const result = await fetchBlob(
      fctx,
      resolved.owner,
      resolved.repo,
      resolved.snapshot.commitSha,
      qualifyPath(input.path, resolved.subpath),
      {
        preferCdn: ctx.config.fetch.preferCdn,
        cdnEnabled: ctx.config.fetch.cdnEnabled,
      },
      resolved.forge,
    );

    const size = result.bytes.byteLength;
    const text = Buffer.from(result.bytes).toString("utf8");

    if (input.head_bytes !== undefined) {
      const sliced = text.slice(0, input.head_bytes);
      return renderBody(resolved, input.path, sliced, size, result.source, true);
    }
    if (input.lines) {
      const [start, end] = input.lines;
      const lines = text.split(/\r?\n/);
      const slice = lines.slice(start, Math.min(lines.length, end)).join("\n");
      return renderBody(resolved, input.path, slice, size, result.source, true);
    }

    if (size > LARGE_FILE_THRESHOLD) {
      const preview = text.slice(0, 4096);
      return [
        renderFrontmatter({
          repo: `${resolved.owner}/${resolved.repo}`,
          ref: resolved.snapshot.requestedRef,
          commit: resolved.snapshot.commitSha.slice(0, 7),
          path: input.path,
          size,
          source: result.source,
          tokensApprox: approxTokens(text),
        }),
        "",
        `> ⚠️ Large file (${size} bytes / ~${approxTokens(text)} tokens). Returning the first 4 KB.`,
        "> Re-call with `head_bytes` or `lines` to read more without inflating the context window.",
        "",
        preview,
      ].join("\n");
    }

    return renderBody(resolved, input.path, text, size, result.source, false);
  };
}

function renderBody(
  resolved: {
    owner: string;
    repo: string;
    snapshot: { requestedRef: string; commitSha: string };
  },
  path: string,
  body: string,
  fullSize: number,
  source: "cache" | "rest" | "cdn" | "graphql",
  partial: boolean,
): string {
  const fm = renderFrontmatter({
    repo: `${resolved.owner}/${resolved.repo}`,
    ref: resolved.snapshot.requestedRef,
    commit: resolved.snapshot.commitSha.slice(0, 7),
    path,
    size: fullSize,
    source,
    tokensApprox: approxTokens(body),
  });
  const note = partial
    ? "\n> Returning a partial slice; call without `lines`/`head_bytes` for the full file.\n"
    : "";
  return `${fm}\n${note}${body}`;
}

function qualifyPath(filePath: string, subpath: string | undefined): string {
  if (!subpath) return filePath.replace(/^\/+/, "");
  if (filePath.startsWith("/")) return filePath.slice(1);
  if (filePath.startsWith(`${subpath}/`)) return filePath;
  return filePath;
}
