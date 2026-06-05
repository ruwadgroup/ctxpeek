/**
 * Pure text helpers for the `peek` tool — binary detection, per-line
 * truncation, head slicing, and an in-file grep that returns context windows.
 *
 * No I/O. Everything here operates on already-fetched bytes/strings so it is
 * unit-testable without the network. The grep is a deliberate, deterministic
 * literal/regex search scoped to ONE named file — navigation, not a vector
 * store. See docs/internals/architecture.md §"Why no semantic search".
 */

/** First NUL byte within the first 8 KB ⇒ treat as binary (git's heuristic). */
export function looksBinary(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 8000);
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}

/** Truncate an over-long line, marking how many characters were dropped. */
export function truncateLine(line: string, max: number): string {
  if (line.length <= max) return line;
  return `${line.slice(0, max)} …(+${line.length - max} chars)`;
}

export type HeadSlice = {
  readonly lines: string[];
  readonly total: number;
};

/** First `n` lines, each capped at `maxLineLen`. `total` = full line count. */
export function headSlice(text: string, n: number, maxLineLen: number): HeadSlice {
  const all = text.split(/\r?\n/);
  const lines = all.slice(0, n).map((l) => truncateLine(l, maxLineLen));
  return { lines, total: all.length };
}

export type GrepLine = {
  /** 1-based line number in the source file. */
  readonly num: number;
  readonly text: string;
  readonly isMatch: boolean;
};

export type GrepChunk = {
  /** 1-based, inclusive. */
  readonly startLine: number;
  /** 1-based, inclusive. */
  readonly endLine: number;
  readonly lines: GrepLine[];
};

export type GrepOptions = {
  readonly query: string;
  readonly regex?: boolean;
  readonly ignoreCase?: boolean;
  readonly context?: number;
  readonly maxMatches?: number;
  readonly maxLineLength?: number;
};

export type GrepResult = {
  readonly chunks: GrepChunk[];
  /** Matching lines found across the whole file. */
  readonly totalMatches: number;
  /** Matching lines actually included (≤ maxMatches). */
  readonly shown: number;
  /** True when totalMatches exceeded the cap. */
  readonly truncated: boolean;
};

const REGEX_META = /[.*+?^${}()|[\]\\]/g;

function buildMatcher(opts: GrepOptions): RegExp {
  const flags = opts.ignoreCase === false ? "" : "i";
  const source = opts.regex ? opts.query : opts.query.replace(REGEX_META, "\\$&");
  try {
    return new RegExp(source, flags);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid regex: ${opts.query} (${detail})`);
  }
}

/**
 * Grep `text` for `query`, returning context windows around each matching
 * line. Overlapping or adjacent windows are merged into one chunk. The cap
 * counts MATCHING lines (not chunks); when exceeded, `truncated` is set and
 * only the first `maxMatches` matches' windows are returned.
 */
export function grep(text: string, opts: GrepOptions): GrepResult {
  const context = Math.max(0, opts.context ?? 3);
  const maxMatches = Math.max(1, opts.maxMatches ?? 20);
  const maxLineLen = opts.maxLineLength ?? 500;
  const matcher = buildMatcher(opts);

  const allLines = text.split(/\r?\n/);
  const matchIdx: number[] = [];
  for (let i = 0; i < allLines.length; i++) {
    if (matcher.test(allLines[i] ?? "")) matchIdx.push(i);
  }

  const totalMatches = matchIdx.length;
  const kept = matchIdx.slice(0, maxMatches);
  const truncated = totalMatches > kept.length;

  // Expand each kept match into a [start, end] window, then merge overlaps
  // and immediate neighbours (gap of 1) into a single chunk.
  const merged: Array<[number, number]> = [];
  for (const i of kept) {
    const start = Math.max(0, i - context);
    const end = Math.min(allLines.length - 1, i + context);
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  const matchSet = new Set(kept);
  const chunks: GrepChunk[] = merged.map(([start, end]) => {
    const lines: GrepLine[] = [];
    for (let i = start; i <= end; i++) {
      lines.push({
        num: i + 1,
        text: truncateLine(allLines[i] ?? "", maxLineLen),
        isMatch: matchSet.has(i),
      });
    }
    return { startLine: start + 1, endLine: end + 1, lines };
  });

  return { chunks, totalMatches, shown: kept.length, truncated };
}
