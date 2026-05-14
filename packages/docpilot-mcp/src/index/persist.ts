/**
 * Index persistence.
 *
 *   indexes/{owner}--{repo}--{commit_sha}.minisearch
 *
 * Persisted via MiniSearch.toJSON()/loadJSON for fast warm starts.
 * Re-built when snapshot sha changes; otherwise reused.
 */
export async function saveIndex(_path: string, _index: unknown): Promise<void> {
  // TODO(v0.2)
  throw new Error("not implemented");
}

export async function loadIndex(_path: string): Promise<unknown | null> {
  // TODO(v0.2)
  return null;
}
