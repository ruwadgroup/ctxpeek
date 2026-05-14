/**
 * Resolver orchestrator — registry-first, GitHub-search last.
 *
 * Algorithm: §7.1 of the design doc.
 *
 *   1. canonical owner/repo shape  → verify_on_github
 *   2. cache hit                   → return
 *   3. registry probes (parallel, race, 250ms each)
 *   4. GitHub /search/repositories (30/min bucket)
 *   5. topic search fallback
 *
 * On ambiguity (top result has stars < 10× #2), return Ambiguous(top_5)
 * as markdown so the model picks.
 */

export interface ResolutionCandidate {
  readonly owner: string;
  readonly repo: string;
  readonly source: "cache" | "npm" | "pypi" | "crates" | "go" | "rubygems" | "packagist" | "hex" | "github-search";
  readonly stars: number | undefined;
  readonly confidence: number;
}

export interface ResolutionResult {
  readonly query: string;
  readonly best: ResolutionCandidate | undefined;
  readonly alternatives: ReadonlyArray<ResolutionCandidate>;
  readonly ambiguous: boolean;
}

export async function resolve(_query: string): Promise<ResolutionResult> {
  // TODO(v0.1, day-1..5): wire registry probes, race-to-first-hit, fallback chain
  throw new Error("not implemented");
}
