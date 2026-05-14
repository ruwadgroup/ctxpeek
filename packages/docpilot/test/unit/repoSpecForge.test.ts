import { describe, expect, it } from "vitest";
import { parseRepoSpec } from "../../src/util/repoSpec.js";

describe("parseRepoSpec — forge prefixes (v0.4)", () => {
  it("defaults to github", () => {
    expect(parseRepoSpec("vercel/next.js").forge).toBe("github");
  });
  it("recognises gh:", () => {
    expect(parseRepoSpec("gh:vercel/next.js").forge).toBe("github");
  });
  it("recognises gitlab: and gl:", () => {
    expect(parseRepoSpec("gitlab:gitlab-org/gitlab").forge).toBe("gitlab");
    expect(parseRepoSpec("gl:gitlab-org/gitlab").forge).toBe("gitlab");
  });
  it("recognises bitbucket: and bb:", () => {
    expect(parseRepoSpec("bitbucket:atlassian/python-bitbucket").forge).toBe("bitbucket");
    expect(parseRepoSpec("bb:atlassian/python-bitbucket").forge).toBe("bitbucket");
  });
  it("preserves ref and subpath through forge prefix", () => {
    const spec = parseRepoSpec("gitlab:gitlab-org/gitlab@master#doc");
    expect(spec.forge).toBe("gitlab");
    expect(spec.ref).toBe("master");
    expect(spec.subpath).toBe("doc");
  });
});
