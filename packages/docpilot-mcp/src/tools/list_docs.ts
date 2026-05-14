/**
 * Tool: list_docs
 *
 * Repository docs tree as a markdown tree (≈75% fewer tokens than JSON).
 * Highlights llms.txt / repo-config nav entries, freshness badges, sizes.
 *
 * See design doc §6.2 (list_docs) and §8.2.
 */
import { z } from "zod";

export const listDocsInput = z.object({
  repo: z.string(),
  deep: z.boolean().optional(),
  include_examples: z.boolean().optional(),
  max_files: z.number().int().positive().optional(),
});

export type ListDocsInput = z.infer<typeof listDocsInput>;

export async function listDocs(_input: ListDocsInput): Promise<string> {
  // TODO(v0.1, day-3): tree fetch + markdown tree renderer (src/format/tree.ts)
  throw new Error("not implemented");
}
