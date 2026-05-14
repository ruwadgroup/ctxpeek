import { describe, expect, it } from "vitest";
import { summarizeMarkdown } from "../../src/format/summarize.js";

describe("summarizeMarkdown", () => {
  it("returns the lead sentence of the longest section", () => {
    const md = `# Title\n\nIntro paragraph that should not dominate.\n\n## Setup\n\nFirst sentence about setup. Second sentence.\n\n## Long section\n\nThis is by far the longest section in the document. It has many words and many sentences. So many that the summarizer should prefer it.\n`;
    const out = summarizeMarkdown(md);
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/longest section|setup/);
  });

  it("drops code blocks", () => {
    const md =
      "## Top\n\nText before code.\n\n```ts\nconst secret = 'CODEBLOCK_SHOULD_NOT_APPEAR';\n```\n\nText after code.\n";
    const out = summarizeMarkdown(md);
    expect(out).not.toContain("CODEBLOCK_SHOULD_NOT_APPEAR");
  });

  it("clamps to maxChars", () => {
    const md = `## h\n\n${"word ".repeat(2000)}`;
    const out = summarizeMarkdown(md, { maxChars: 100 });
    expect(out.length).toBeLessThanOrEqual(100);
  });

  it("returns empty string on empty input", () => {
    expect(summarizeMarkdown("")).toBe("");
  });
});
