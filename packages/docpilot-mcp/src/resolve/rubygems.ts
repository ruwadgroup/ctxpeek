/**
 * RubyGems registry probe.
 *
 *   GET https://rubygems.org/api/v1/gems/{name}.json
 *
 * Inspect `source_code_uri`.
 */
export async function probeRubygems(_name: string): Promise<{ owner: string; repo: string } | null> {
  // TODO(v0.2)
  return null;
}
