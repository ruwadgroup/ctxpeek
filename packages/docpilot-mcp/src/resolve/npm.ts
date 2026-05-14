/**
 * npm registry probe.
 *
 *   GET https://registry.npmjs.org/{name}
 *
 * Then parse `repository.url`: typically `git+https://github.com/{o}/{r}.git`.
 * Strip the `git+`, the `.git` suffix, and the protocol.
 */
export async function probeNpm(_name: string): Promise<{ owner: string; repo: string } | null> {
  // TODO(v0.1, day-1): fetch + parse repository.url, handle scoped pkgs
  return null;
}
