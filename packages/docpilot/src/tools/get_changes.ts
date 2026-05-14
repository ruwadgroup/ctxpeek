/**
 * Tool: get_changes
 *
 * Unified diff for one file across two refs. Sister tool: get_changelog
 * (multi-file via CHANGELOG.md or commits touching docs paths).
 *
 * See design doc §6.2 (get_changes), §8.6.
 */
import { z } from "zod";

export const getChangesInput = z.object({
  repo: z.string(),
  path: z.string(),
  from_ref: z.string(),
  to_ref: z.string(),
});

export type GetChangesInput = z.infer<typeof getChangesInput>;

export async function getChanges(_input: GetChangesInput): Promise<string> {
  // TODO(v0.2): GraphQL or REST compare + unified diff renderer
  throw new Error("not implemented");
}
