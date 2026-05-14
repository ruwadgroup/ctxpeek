import { describe, expect, it } from "vitest";
import { parseCliOverrides } from "../../src/config.js";

describe("parseCliOverrides", () => {
  it("parses --token and --cache-dir", () => {
    const out = parseCliOverrides(["--token", "abc", "--cache-dir=/tmp/x"]);
    expect(out.token).toBe("abc");
    expect(out.cacheDir).toBe("/tmp/x");
  });
  it("parses --no-cdn and --cdn-only flags", () => {
    const out = parseCliOverrides(["--no-cdn"]);
    expect(out.noCdn).toBe(true);
    const out2 = parseCliOverrides(["--cdn-only"]);
    expect(out2.cdnOnly).toBe(true);
  });
  it("ignores unrelated args", () => {
    expect(parseCliOverrides(["doctor"])).toEqual({});
  });
  it("parses --log-level", () => {
    const out = parseCliOverrides(["--log-level", "debug"]);
    expect(out.logLevel).toBe("debug");
  });
});
