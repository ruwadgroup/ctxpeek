/**
 * Tool: resolve_repo
 *
 * Turn a fuzzy library name into a canonical `owner/repo`. Registry-first
 * (npm/PyPI/crates/go/rubygems/packagist/hex), GitHub /search/repositories
 * as last resort. Returns markdown with the resolved repo + alternatives.
 *
 * See design doc §7.
 */
import { z } from "zod";

export const resolveRepoInput = z.object({
  query: z.string().min(1),
  ecosystem: z.enum(["npm", "pypi", "crates", "go", "rubygems", "packagist", "hex"]).optional(),
  force_refresh: z.boolean().optional(),
});

export type ResolveRepoInput = z.infer<typeof resolveRepoInput>;

export async function resolveRepo(_input: ResolveRepoInput): Promise<string> {
  // TODO(v0.1, day-1): orchestrator from src/resolve/orchestrator.ts
  throw new Error("not implemented");
}
