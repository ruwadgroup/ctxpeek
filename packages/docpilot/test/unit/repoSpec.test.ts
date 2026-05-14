import { describe, expect, it } from "vitest";
import { parseRepoSpec } from "../../src/util/repoSpec.js";

describe("parseRepoSpec", () => {
  it("parses owner/repo only", () => {
    expect(parseRepoSpec("vercel/next.js")).toEqual({
      forge: "github",
      owner: "vercel",
      repo: "next.js",
      ref: undefined,
      subpath: undefined,
    });
  });

  it("parses owner/repo@ref", () => {
    expect(parseRepoSpec("vercel/next.js@v15.0.0")).toEqual({
      forge: "github",
      owner: "vercel",
      repo: "next.js",
      ref: "v15.0.0",
      subpath: undefined,
    });
  });

  it("parses subpath", () => {
    const spec = parseRepoSpec("tailwindlabs/tailwindcss@main#packages/tailwindcss/docs");
    expect(spec.subpath).toBe("packages/tailwindcss/docs");
  });

  it("strips leading and trailing slashes from subpath", () => {
    expect(parseRepoSpec("o/r#/foo/bar/").subpath).toBe("foo/bar");
  });

  it("rejects missing slash", () => {
    expect(() => parseRepoSpec("nextjs")).toThrow(/repo spec/);
  });

  it("rejects empty input", () => {
    expect(() => parseRepoSpec("")).toThrow();
  });
});
