/**
 * Tool: doc_quality
 *
 * Scorecard for a repo: llms.txt / llms-full.txt presence, README links,
 * structured nav (Mintlify/Docusaurus/VitePress detection), last docs
 * commit age, file-size distribution. Helps the model decide whether
 * docpilot is the right tool for this repo.
 *
 * See design doc §8.7, §14 Tier S #4.
 */
import { z } from "zod";

export const docQualityInput = z.object({
  repo: z.string(),
});

export type DocQualityInput = z.infer<typeof docQualityInput>;

export async function docQuality(_input: DocQualityInput): Promise<string> {
  // TODO(v0.2): probe llms.txt + README + framework configs
  throw new Error("not implemented");
}
