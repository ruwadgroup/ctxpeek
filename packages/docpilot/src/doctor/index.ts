/**
 * `docpilot doctor` — environment self-check.
 *
 * Major checks (§13.2):
 *   - OS detection; on Windows, print recommended `cmd /c` config
 *   - node + npx resolvable from non-shell-spawn context
 *   - GITHUB_TOKEN present? scope sufficient (Contents: Read for public)?
 *   - cache dir writable
 *   - jsDelivr reachable (tiny HEAD request)
 *   - api.github.com reachable; print remaining quota if authed
 */
export interface DoctorReport {
  readonly ok: boolean;
  readonly checks: ReadonlyArray<{ name: string; status: "ok" | "warn" | "fail"; detail?: string }>;
}

export async function runDoctor(): Promise<DoctorReport> {
  // TODO(v0.1, week-5)
  throw new Error("not implemented");
}
