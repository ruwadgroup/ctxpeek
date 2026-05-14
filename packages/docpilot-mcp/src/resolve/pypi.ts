/**
 * PyPI registry probe.
 *
 *   GET https://pypi.org/pypi/{name}/json
 *
 * Inspect `info.project_urls["Source" | "Homepage" | "Repository"]`
 * and pick the github.com one.
 */
export async function probePyPi(_name: string): Promise<{ owner: string; repo: string } | null> {
  // TODO(v0.1, day-5)
  return null;
}
