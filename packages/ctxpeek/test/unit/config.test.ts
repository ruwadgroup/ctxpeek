import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, parseCliOverrides } from "../../src/config.js";

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
});

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

describe("loadConfig", () => {
  it("merges global and project package mappings with project overrides", async () => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "ctxpeek-config-")));
    const xdg = path.join(root, "xdg");
    const project = path.join(root, "project");
    await fs.mkdir(path.join(xdg, "ctxpeek"), { recursive: true });
    await fs.mkdir(project, { recursive: true });
    await fs.writeFile(
      path.join(xdg, "ctxpeek", "config.toml"),
      [
        "[[package]]",
        'name = "@acme/ui"',
        'spec = "acme/global-ui"',
        "",
        "[[package]]",
        'name = "@acme/auth"',
        'spec = "acme/auth"',
        "",
      ].join("\n"),
    );
    await fs.writeFile(
      path.join(project, ".ctxpeek.toml"),
      ["[[package]]", 'name = "@acme/ui"', 'spec = "acme/app#packages/ui"', 'ecosystem = "npm"', ""].join(
        "\n",
      ),
    );

    process.chdir(project);

    const config = await loadConfig([], {
      ...process.env,
      XDG_CONFIG_HOME: xdg,
      GITHUB_TOKEN: "test-token",
    });
    const mappings = new Map(config.resolve.packageMappings.map((mapping) => [mapping.name, mapping]));

    expect(mappings.get("@acme/ui")).toEqual({
      name: "@acme/ui",
      spec: "acme/app#packages/ui",
      ecosystem: "npm",
    });
    expect(mappings.get("@acme/auth")).toEqual({
      name: "@acme/auth",
      spec: "acme/auth",
      ecosystem: undefined,
    });
  });
});
