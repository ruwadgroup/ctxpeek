import { describe, expect, it } from "vitest";
import { buildIndex, type IndexedDoc, parseMarkdown } from "../../src/search/build.js";

describe("parseMarkdown", () => {
  it("extracts title and headings, drops code blocks", () => {
    const doc = parseMarkdown(
      "docs/intro.md",
      "# Intro\n\nLead paragraph.\n\n## Setup\n\n```ts\nconst x = 1;\n```\n\n## Usage\n\nMore text.\n",
    );
    expect(doc.title).toBe("Intro");
    expect(doc.headings).toContain("Setup");
    expect(doc.headings).toContain("Usage");
    expect(doc.body).toContain("Lead paragraph");
    expect(doc.body).not.toContain("const x = 1");
  });
  it("falls back to filename when no top heading", () => {
    const doc = parseMarkdown("docs/api-reference.md", "Some text without a heading.");
    expect(doc.title).toBe("api-reference");
  });
});

describe("buildIndex", () => {
  it("returns hits ordered by relevance", () => {
    const docs: IndexedDoc[] = [
      {
        id: "docs/routing.md",
        path: "docs/routing.md",
        title: "Routing",
        headings: "Middleware Layouts",
        body: "Middleware lets you run code before a request is completed. Middleware is great.",
        bodyPreview: "Middleware lets you run code before a request is completed.",
        size: 100,
        lastModified: "2026-01-01",
      },
      {
        id: "docs/data.md",
        path: "docs/data.md",
        title: "Data fetching",
        headings: "Server Actions",
        body: "Data fetching basics.",
        bodyPreview: "Data fetching basics.",
        size: 100,
        lastModified: "2026-01-01",
      },
    ];
    const idx = buildIndex(docs);
    const results = idx.search("middleware");
    expect(results.length).toBeGreaterThan(0);
    const first = results[0];
    expect(first).toBeDefined();
    expect(first?.id).toBe("docs/routing.md");
  });
});
