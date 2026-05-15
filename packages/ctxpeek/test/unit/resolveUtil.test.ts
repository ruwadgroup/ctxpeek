import { describe, expect, it } from "vitest";
import { extractGithub, extractRepo } from "../../src/resolve/extractGithub.js";

describe("extractGithub", () => {
  it("parses git+https URL", () => {
    expect(extractGithub("git+https://github.com/vercel/next.js.git")).toEqual({
      owner: "vercel",
      repo: "next.js",
    });
  });
  it("parses plain https URL", () => {
    expect(extractGithub("https://github.com/tailwindlabs/tailwindcss")).toEqual({
      owner: "tailwindlabs",
      repo: "tailwindcss",
    });
  });
  it("strips trailing .git", () => {
    expect(extractGithub("https://github.com/foo/bar.git#readme")).toEqual({
      owner: "foo",
      repo: "bar",
    });
  });
  it("returns null for non-github URLs", () => {
    expect(extractGithub("https://example.com/foo/bar")).toBeNull();
  });
  it("returns null for nullish input", () => {
    expect(extractGithub(undefined)).toBeNull();
    expect(extractGithub(null)).toBeNull();
    expect(extractGithub("")).toBeNull();
  });
  it("parses git:// scp-like URL", () => {
    expect(extractGithub("git@github.com:rust-lang/cargo.git")).toEqual({
      owner: "rust-lang",
      repo: "cargo",
    });
  });
});

describe("extractRepo", () => {
  it("parses supported forge URLs", () => {
    expect(extractRepo("https://gitlab.com/gitlab-org/gitlab.git")).toEqual({
      forge: "gitlab",
      owner: "gitlab-org",
      repo: "gitlab",
    });
    expect(extractRepo("git@bitbucket.org:team/project.git")).toEqual({
      forge: "bitbucket",
      owner: "team",
      repo: "project",
    });
  });

  it("parses hosted-git shorthands", () => {
    expect(extractRepo("github:tanstack/query")).toEqual({
      forge: "github",
      owner: "tanstack",
      repo: "query",
    });
  });
});
