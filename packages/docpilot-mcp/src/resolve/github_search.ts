/**
 * GitHub repository search — last-resort resolver step.
 *
 *   GET /search/repositories?q={q}+in:name&sort=stars&per_page=5
 *
 * Separate 30/min rate-limit bucket. Slow (≈300–800 ms p95). Use only
 * after every registry probe has failed. See §7.1 step 3.
 */
export async function searchGithub(_query: string): Promise<ReadonlyArray<{ owner: string; repo: string; stars: number }>> {
  // TODO(v0.1, day-5)
  return [];
}
