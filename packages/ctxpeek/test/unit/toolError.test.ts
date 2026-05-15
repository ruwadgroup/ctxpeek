import { describe, expect, it } from "vitest";
import { z } from "zod";
import { RateLimitError } from "../../src/core/index.js";
import { toolErrorResult } from "../../src/tools/toolError.js";

describe("toolErrorResult", () => {
  it("returns model-visible markdown for rate limit errors", () => {
    const resetAt = new Date("2026-05-15T06:29:05.000Z");
    const result = toolErrorResult("list_docs", new RateLimitError("GitHub rate limit hit", resetAt));
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";

    expect(result.isError).toBeUndefined();
    expect(text).toContain("# list_docs could not complete");
    expect(text).toContain("code: rate_limit");
    expect(text).toContain("message: GitHub rate limit hit");
    expect(text).toContain("reset_at: 2026-05-15T06:29:05.000Z");
    expect(text).toContain("Call `rate_limits`");
    expect(result.structuredContent).toMatchObject({
      ok: false,
      tool: "list_docs",
      error: {
        code: "rate_limit",
        message: "GitHub rate limit hit",
        reset_at: "2026-05-15T06:29:05.000Z",
        retryable: true,
      },
    });
  });

  it("includes validation details for invalid tool input", () => {
    const schema = z.object({ repo: z.string() });
    const parsed = schema.safeParse({});
    if (parsed.success) throw new Error("expected schema parse to fail");

    const result = toolErrorResult("list_docs", parsed.error);
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";

    expect(result.isError).toBeUndefined();
    expect(text).toContain("code: invalid_input");
    expect(text).toContain("repo: Required");
    expect(result.structuredContent).toMatchObject({
      ok: false,
      tool: "list_docs",
      error: {
        code: "invalid_input",
        details: ["repo: Required"],
        retryable: true,
      },
    });
  });
});
