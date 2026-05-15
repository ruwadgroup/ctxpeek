import { describe, expect, it } from "vitest";
import { approxTokens, formatBytes, formatRelativeAge, parseSize } from "../../src/util/tokens.js";

describe("approxTokens", () => {
  it("estimates roughly text.length / 4", () => {
    expect(approxTokens("abcd")).toBe(1);
    expect(approxTokens("abcdefgh")).toBe(2);
    expect(approxTokens("")).toBe(0);
  });
});

describe("formatBytes", () => {
  it("renders B/k/M boundaries", () => {
    expect(formatBytes(500)).toBe("500B");
    expect(formatBytes(2048)).toBe("2.0k");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0M");
  });
});

describe("parseSize", () => {
  it("parses bytes and units", () => {
    expect(parseSize("1024")).toBe(1024);
    expect(parseSize("1KiB")).toBe(1024);
    expect(parseSize("1MiB")).toBe(1024 * 1024);
    expect(parseSize("1GiB")).toBe(1024 * 1024 * 1024);
    expect(parseSize("1MB")).toBe(1_000_000);
  });
  it("throws on garbage", () => {
    expect(() => parseSize("abc")).toThrow();
  });
});

describe("formatRelativeAge", () => {
  it("rounds to human-friendly buckets", () => {
    const now = new Date("2026-05-14T12:00:00Z");
    expect(formatRelativeAge("2026-05-14T11:30:00Z", now)).toBe("30m ago");
    expect(formatRelativeAge("2026-05-13T12:00:00Z", now)).toBe("1d ago");
    expect(formatRelativeAge("2026-04-01T00:00:00Z", now)).toBe("1mo ago");
  });
  it("survives bad input", () => {
    expect(formatRelativeAge("not-a-date")).toBe("?");
  });
});
