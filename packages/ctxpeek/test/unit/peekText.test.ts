import { describe, expect, it } from "vitest";
import { grep, headSlice, looksBinary, truncateLine } from "../../src/format/peekText.js";

describe("looksBinary", () => {
  it("flags content with a NUL byte", () => {
    expect(looksBinary(new Uint8Array([0x68, 0x69, 0x00, 0x21]))).toBe(true);
  });
  it("treats plain UTF-8 text as non-binary", () => {
    expect(looksBinary(new Uint8Array(Buffer.from("hello\nworld\n", "utf8")))).toBe(false);
  });
  it("only scans the first 8 KB", () => {
    const bytes = new Uint8Array(20000);
    bytes.fill(0x61); // 'a'
    bytes[9000] = 0x00; // NUL past the scan window
    expect(looksBinary(bytes)).toBe(false);
  });
});

describe("truncateLine", () => {
  it("leaves short lines untouched", () => {
    expect(truncateLine("short", 10)).toBe("short");
  });
  it("truncates and reports dropped chars", () => {
    expect(truncateLine("abcdefghij", 4)).toBe("abcd …(+6 chars)");
  });
});

describe("headSlice", () => {
  it("returns the first n lines and the true total", () => {
    const { lines, total } = headSlice("a\nb\nc\nd\ne", 3, 100);
    expect(lines).toEqual(["a", "b", "c"]);
    expect(total).toBe(5);
  });
  it("returns the whole file when n exceeds the line count", () => {
    const { lines, total } = headSlice("a\nb", 40, 100);
    expect(lines).toEqual(["a", "b"]);
    expect(total).toBe(2);
  });
  it("handles CRLF line endings", () => {
    const { lines, total } = headSlice("a\r\nb\r\nc", 2, 100);
    expect(lines).toEqual(["a", "b"]);
    expect(total).toBe(3);
  });
  it("truncates long lines per maxLineLen", () => {
    const { lines } = headSlice("xxxxxxxxxx", 1, 4);
    expect(lines[0]).toBe("xxxx …(+6 chars)");
  });
});

describe("grep", () => {
  const doc = ["import a", "function foo() {", "  return BAR", "}", "", "const baz = 1"].join("\n");

  it("finds a literal match with surrounding context", () => {
    const res = grep(doc, { query: "return", context: 1 });
    expect(res.totalMatches).toBe(1);
    expect(res.shown).toBe(1);
    expect(res.truncated).toBe(false);
    expect(res.chunks).toHaveLength(1);
    const chunk = res.chunks[0];
    expect(chunk?.startLine).toBe(2);
    expect(chunk?.endLine).toBe(4);
    expect(chunk?.lines.find((l) => l.isMatch)?.num).toBe(3);
  });

  it("is case-insensitive by default and case-sensitive on request", () => {
    expect(grep(doc, { query: "bar" }).totalMatches).toBe(1);
    expect(grep(doc, { query: "bar", ignoreCase: false }).totalMatches).toBe(0);
  });

  it("treats the query as a literal by default (regex meta escaped)", () => {
    // "foo()" contains regex metacharacters; literal mode must match the text.
    expect(grep(doc, { query: "foo()" }).totalMatches).toBe(1);
  });

  it("honours regex mode", () => {
    const res = grep(doc, { query: "^const\\b", regex: true });
    expect(res.totalMatches).toBe(1);
    expect(res.chunks[0]?.lines.find((l) => l.isMatch)?.num).toBe(6);
  });

  it("throws a friendly error on an invalid regex", () => {
    expect(() => grep(doc, { query: "(", regex: true })).toThrow(/invalid regex/);
  });

  it("merges overlapping/adjacent context windows into one chunk", () => {
    const lines = Array.from({ length: 10 }, (_, i) => (i === 2 || i === 4 ? "HIT" : `line ${i}`));
    const res = grep(lines.join("\n"), { query: "HIT", context: 2 });
    expect(res.totalMatches).toBe(2);
    expect(res.chunks).toHaveLength(1); // windows [0..4] and [2..6] merge
    expect(res.chunks[0]?.startLine).toBe(1);
    expect(res.chunks[0]?.endLine).toBe(7);
  });

  it("keeps distant matches in separate chunks", () => {
    const lines = Array.from({ length: 20 }, (_, i) => (i === 1 || i === 15 ? "HIT" : `line ${i}`));
    const res = grep(lines.join("\n"), { query: "HIT", context: 1 });
    expect(res.chunks).toHaveLength(2);
  });

  it("caps matches and flags truncation", () => {
    const lines = Array.from({ length: 30 }, () => "HIT");
    const res = grep(lines.join("\n"), { query: "HIT", context: 0, maxMatches: 5 });
    expect(res.totalMatches).toBe(30);
    expect(res.shown).toBe(5);
    expect(res.truncated).toBe(true);
  });

  it("returns no chunks when nothing matches", () => {
    const res = grep(doc, { query: "nonexistent" });
    expect(res.totalMatches).toBe(0);
    expect(res.chunks).toHaveLength(0);
    expect(res.truncated).toBe(false);
  });

  it("truncates long matching lines", () => {
    const longLine = `match ${"x".repeat(100)}`;
    const res = grep(longLine, { query: "match", maxLineLength: 10 });
    expect(res.chunks[0]?.lines[0]?.text).toContain("…(+");
  });
});
