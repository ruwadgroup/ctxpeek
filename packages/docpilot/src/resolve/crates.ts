/**
 * crates.io registry probe.
 *
 *   GET https://crates.io/api/v1/crates/{name}
 *
 * Inspect `crate.repository`.
 */
export async function probeCrates(_name: string): Promise<{ owner: string; repo: string } | null> {
  // TODO(v0.1, day-5)
  return null;
}
