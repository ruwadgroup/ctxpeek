import { z } from "zod";
import { fetchBlob } from "../fetch/strategy.js";
import {
  approxTokens,
  type GrepChunk,
  grep,
  headSlice,
  looksBinary,
  renderFrontmatter,
} from "../format/index.js";
import { fetchContextFrom, type ResolvedRepo, resolveSnapshot, type ToolContext } from "./context.js";

export const peekInput = z.object({
  repo: z.string(),
  path: z.string(),
  /** Head mode: number of leading lines to return. Ignored when `query` is set. */
  n: z.number().int().positive().max(2000).default(40),
  /** Grep mode: literal substring (default) or regex to search for within the file. */
  query: z.string().min(1).optional(),
  /** Treat `query` as a JavaScript regular expression instead of a literal. */
  regex: z.boolean().default(false),
  /** Case-insensitive matching (grep mode). Default true. */
  ignore_case: z.boolean().default(true),
  /** Lines of context to include around each match (grep mode). */
  context: z.number().int().nonnegative().max(50).default(3),
  /** Cap on matches returned (grep mode); a note is emitted when exceeded. */
  max_matches: z.number().int().positive().max(200).default(20),
  /** Per-line character cap; longer lines are truncated with a marker. Both modes. */
  max_line_length: z.number().int().positive().max(10000).default(500),
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

    const size = result.bytes.byteLength;

    if (size === 0) {
      return [
        header(resolved, input.path, "empty"),
        "",
        fm(resolved, input.path, size),
        "",
        "> Empty file (0 bytes).",
      ].join("\n");
    }
    if (looksBinary(result.bytes)) {
      return [
        header(resolved, input.path, "binary"),
        "",
        fm(resolved, input.path, size),
        "",
        `> ⚠️ Binary file (${size} bytes) — contents not shown. ctxpeek serves text docs; use \`get_changes\` for diffs or open it on the forge.`,
      ].join("\n");
    }

    const text = Buffer.from(result.bytes).toString("utf8");

    if (input.query !== undefined) {
      return renderGrep(resolved, input, text, size);
    }
    return renderHead(resolved, input, text, size);
  };
}

function renderHead(resolved: ResolvedRepo, input: PeekInput, text: string, size: number): string {
  const { lines, total } = headSlice(text, input.n, input.max_line_length);
  const body = lines.join("\n");
  const title = `# Peek: ${repoRef(resolved)}:${input.path} (first ${Math.min(input.n, total)} of ${total} lines / ${size} bytes total)`;
  return [title, "", fm(resolved, input.path, size, body), "", body].join("\n");
}

function renderGrep(resolved: ResolvedRepo, input: PeekInput, text: string, size: number): string {
  const res = grep(text, {
    query: input.query as string,
    regex: input.regex,
    ignoreCase: input.ignore_case,
    context: input.context,
    maxMatches: input.max_matches,
    maxLineLength: input.max_line_length,
  });

  const totalLines = text.split(/\r?\n/).length;
  const title = `# Grep: ${repoRef(resolved)}:${input.path} — "${input.query}" (${res.totalMatches} match${
    res.totalMatches === 1 ? "" : "es"
  } in ${totalLines} lines / ${size} bytes total)`;

  if (res.totalMatches === 0) {
    return [
      title,
      "",
      fm(resolved, input.path, size),
      "",
      `> No matches for \`${input.query}\`. Try a broader term, \`regex: true\`, or \`peek\` without a query to read the head.`,
    ].join("\n");
  }

  const blocks = res.chunks.map(renderChunk);
  const body = blocks.join("\n──\n");
  const notes: string[] = [];
  if (res.truncated) {
    notes.push(
      `> Showing the first ${res.shown} of ${res.totalMatches} matches — raise \`max_matches\` or tighten the query for the rest.`,
    );
  }
  return [
    title,
    "",
    fm(resolved, input.path, size, body),
    "",
    ...(notes.length ? [...notes, ""] : []),
    body,
  ].join("\n");
}

function renderChunk(chunk: GrepChunk): string {
  // Right-align line numbers within the chunk; mark matching lines with ›.
  const width = String(chunk.endLine).length;
  return chunk.lines
    .map((l) => {
      const num = String(l.num).padStart(width, " ");
      const marker = l.isMatch ? "›" : " ";
      return `${num}${marker} ${l.text}`;
    })
    .join("\n");
}

function header(resolved: ResolvedRepo, path: string, kind: "empty" | "binary"): string {
  const label = kind === "binary" ? "binary" : "empty";
  return `# Peek: ${repoRef(resolved)}:${path} (${label})`;
}

function repoRef(resolved: ResolvedRepo): string {
  return `${resolved.owner}/${resolved.repo}@${resolved.snapshot.requestedRef}`;
}

/** Frontmatter with `~tokens` reflecting the returned payload (not the full file). */
function fm(resolved: ResolvedRepo, path: string, size: number, returned?: string): string {
  return renderFrontmatter({
    repo: `${resolved.owner}/${resolved.repo}`,
    ref: resolved.snapshot.requestedRef,
    commit: resolved.snapshot.commitSha.slice(0, 7),
    path,
    size,
    ...(returned !== undefined ? { tokensApprox: approxTokens(returned) } : {}),
  });
}
