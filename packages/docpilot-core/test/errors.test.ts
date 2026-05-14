import { describe, expect, it } from "vitest";
import { DocpilotError, InvalidRepoSpecError, NotFoundError } from "../src/errors.js";

describe("error hierarchy", () => {
  it("InvalidRepoSpecError is a DocpilotError", () => {
    const err = new InvalidRepoSpecError("foo", "missing slash");
    expect(err).toBeInstanceOf(DocpilotError);
    expect(err.code).toBe("invalid_repo_spec");
    expect(err.message).toContain("foo");
    expect(err.message).toContain("missing slash");
  });

  it("NotFoundError carries a code", () => {
    const err = new NotFoundError("vercel/nope");
    expect(err.code).toBe("not_found");
  });
});
