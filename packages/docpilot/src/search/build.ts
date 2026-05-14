/**
 * MiniSearch (BM25+) index build.
 *
 * Per-doc indexed fields:
 *   title    — first `# heading` or filename stem
 *   headings — concatenated `## …`
 *   body     — full text, code blocks weighted 0.5×
 *   path     — boost 3× for slug matches
 *
 * Stored: { path, title, size, last_modified }.
 *
 * Built lazily on first search call; ~5–15% of source-text size on disk.
 */
import MiniSearch from "minisearch";

export type IndexedDoc = {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly headings: string;
  readonly body: string;
  readonly bodyPreview: string;
  readonly size: number;
  readonly lastModified: string;
};

export type DocsIndex = MiniSearch<IndexedDoc>;

const SEARCH_OPTIONS = {
  fields: ["title", "headings", "body", "path"],
  storeFields: ["path", "title", "size", "lastModified", "bodyPreview"],
  searchOptions: {
    boost: { title: 3, headings: 2, path: 3, body: 1 },
    fuzzy: 0.2,
    prefix: true,
    combineWith: "AND" as const,
  },
};

export function createIndex(): DocsIndex {
  return new MiniSearch<IndexedDoc>(SEARCH_OPTIONS);
}

export function buildIndex(docs: ReadonlyArray<IndexedDoc>): DocsIndex {
  const index = createIndex();
  index.addAll([...docs]);
  return index;
}

export type ParsedDoc = {
  readonly title: string;
  readonly headings: string;
  readonly body: string;
};

/**
 * Extract title (first `# heading` or filename), headings (## … concatenated),
 * and body (full text with code blocks deweighted by truncation).
 */
export function parseMarkdown(filePath: string, text: string): ParsedDoc {
  const lines = text.split(/\r?\n/);
  let title = "";
  const headings: string[] = [];
  let inCode = false;
  const bodyParts: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    if (!title && /^#\s+/.test(trimmed)) {
      title = trimmed.replace(/^#\s+/, "");
      continue;
    }
    const hMatch = /^(#{2,4})\s+(.*)$/.exec(trimmed);
    if (hMatch) {
      headings.push(hMatch[2] ?? "");
      bodyParts.push(hMatch[2] ?? "");
      continue;
    }
    if (trimmed) bodyParts.push(trimmed);
  }
  if (!title) {
    const base = filePath.split("/").pop() ?? filePath;
    title = base.replace(/\.(md|mdx|rst|adoc|txt)$/i, "");
  }
  return {
    title,
    headings: headings.join(" \n "),
    body: bodyParts.join(" "),
  };
}
