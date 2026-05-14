/**
 * pkg.go.dev probe.
 *
 *   GET https://pkg.go.dev/{name}
 *
 * Scrape the "Repository:" link from the HTML. Module paths often *are*
 * github.com/o/r already, in which case we short-circuit without scraping.
 */
export async function probeGoPkg(_name: string): Promise<{ owner: string; repo: string } | null> {
  // TODO(v0.2)
  return null;
}
