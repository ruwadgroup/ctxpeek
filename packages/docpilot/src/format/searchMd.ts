/**
 * Markdown renderer for `search_docs` results.
 */
export type SearchHit = {
  readonly path: string;
  readonly score: number;
  readonly snippet: string;
};

export type SearchOptions = {
  readonly repoLabel: string;
  readonly elapsedMs: number;
};

export function renderSearchResults(
  query: string,
  hits: ReadonlyArray<SearchHit>,
  opts: SearchOptions,
): string {
  const lines: string[] = [];
  const elapsed = (opts.elapsedMs / 1000).toFixed(2);
  lines.push(
    `# Search: "${query}" in ${opts.repoLabel}  (${hits.length} hit${
      hits.length === 1 ? "" : "s"
    }, ${elapsed}s)`,
  );
  lines.push("");
  if (hits.length === 0) {
    lines.push("_No matches. Try `list_docs` to see what files exist._");
    return lines.join("\n");
  }
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    if (!h) continue;
    lines.push(`${i + 1}. ${h.path}  · score ${h.score.toFixed(1)}`);
    if (h.snippet) {
      const snippetLines = h.snippet
        .split("\n")
        .map((l) => `   > ${l.trim()}`)
        .filter((l) => l.trim() !== ">");
      lines.push(...snippetLines.slice(0, 3));
    }
    lines.push(`   \`fetch_doc("${opts.repoLabel}", "${h.path}")\``);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
