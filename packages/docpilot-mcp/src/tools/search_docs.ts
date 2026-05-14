/**
 * Tool: search_docs
 *
 * BM25+ search via MiniSearch over the snapshot's docs files. Returns
 * ranked markdown with snippets.
 *
 * See design doc §6.2 (search_docs), §8.4, §10.
 */
import { z } from "zod";

export const searchDocsInput = z.object({
  repo: z.string(),
  query: z.string().min(1),
  limit: z.number().int().positive().max(100).default(10),
  fields: z.array(z.enum(["title", "headings", "body"])).optional(),
  snippet_chars: z.number().int().positive().default(240),
});

export type SearchDocsInput = z.infer<typeof searchDocsInput>;

export async function searchDocs(_input: SearchDocsInput): Promise<string> {
  // TODO(v0.2, week-2): index lifecycle + search renderer
  throw new Error("not implemented");
}
