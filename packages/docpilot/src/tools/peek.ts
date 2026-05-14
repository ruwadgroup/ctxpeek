/**
 * Tool: peek
 *
 * Cheap preview — first N lines of a file before committing to a full
 * fetch. Stops the model from loading a 30k-token file to find out it's
 * the wrong one.
 *
 * See design doc §6.2 (peek), §8.5, §14 Tier S #1.
 */
import { z } from "zod";

export const peekInput = z.object({
  repo: z.string(),
  path: z.string(),
  n: z.number().int().positive().default(40),
});

export type PeekInput = z.infer<typeof peekInput>;

export async function peek(_input: PeekInput): Promise<string> {
  // TODO(v0.1, week-2): read N lines via the same fetch path
  throw new Error("not implemented");
}
