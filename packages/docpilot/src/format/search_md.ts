/**
 * Markdown renderer for `search_docs` results.
 *
 *   1. docs/.../middleware.mdx · score 12.4
 *      > Middleware lets you run code before a request is completed…
 *      `fetch_doc(...)`
 */
export interface SearchHit {
  readonly path: string;
  readonly score: number;
  readonly snippet: string;
}

export function renderSearchResults(
  _repo: string,
  _query: string,
  _hits: ReadonlyArray<SearchHit>,
  _elapsedMs: number,
): string {
  // TODO(v0.2, week-2)
  throw new Error("not implemented");
}
