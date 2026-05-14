/**
 * Markdown tree renderer for `list_docs`.
 *
 * Produces the `├── 02-routing.mdx  8.7k  ✦` style output described in
 * design doc §6.2 (list_docs). ≈75% fewer tokens than equivalent JSON.
 */
export interface TreeEntry {
  readonly path: string;
  readonly size: number;
  readonly highSignal: boolean;
  readonly highlightedInNav: boolean;
  readonly recentlyChanged: boolean;
}

export function renderTree(_repo: string, _entries: ReadonlyArray<TreeEntry>): string {
  // TODO(v0.1, day-3)
  throw new Error("not implemented");
}
