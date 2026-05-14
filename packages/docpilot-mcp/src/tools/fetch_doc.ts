/**
 * Tool: fetch_doc
 *
 * Single-file fetch with markdown frontmatter for metadata. Honours
 * `lines` / `head_bytes` for partial reads. Files >200 KB without those
 * options return a `peek` plus instructions.
 *
 * See design doc §6.2 (fetch_doc) and §8.3.
 */
import { z } from "zod";

export const fetchDocInput = z.object({
  repo: z.string(),
  path: z.string(),
  lines: z.tuple([z.number().int().nonnegative(), z.number().int().positive()]).optional(),
  head_bytes: z.number().int().positive().optional(),
});

export type FetchDocInput = z.infer<typeof fetchDocInput>;

export async function fetchDoc(_input: FetchDocInput): Promise<string> {
  // TODO(v0.1, day-2): fetch via strategy.ts + frontmatter renderer
  throw new Error("not implemented");
}
