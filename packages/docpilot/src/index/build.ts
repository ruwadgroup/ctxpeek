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
 *
 * See design doc §10.
 */
export interface IndexedDoc {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly headings: string;
  readonly body: string;
  readonly size: number;
  readonly lastModified: string;
}

export async function buildIndex(_docs: ReadonlyArray<IndexedDoc>): Promise<unknown> {
  // TODO(v0.2, week-2): MiniSearch instance with BM25+ params
  throw new Error("not implemented");
}
