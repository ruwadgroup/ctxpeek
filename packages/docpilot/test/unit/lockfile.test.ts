import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { detectManifests, installSuggestion } from "../../src/lockfile.js";

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "docpilot-lockfile-"));
}

describe("detectManifests", () => {
  it("parses package.json", async () => {
    const dir = await tmpDir();
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({
        dependencies: { "drizzle-orm": "^0.30.1", react: "19.0.0" },
        devDependencies: { typescript: "5.6.3" },
      }),
    );
    const out = await detectManifests(dir, dir);
    expect(out.length).toBe(1);
    const m = out[0];
    expect(m?.ecosystem).toBe("npm");
    const names = m?.deps.map((d) => d.name).sort();
    expect(names).toEqual(["drizzle-orm", "react", "typescript"]);
  });

  it("parses requirements.txt", async () => {
    const dir = await tmpDir();
    await fs.writeFile(path.join(dir, "requirements.txt"), "fastapi==0.110.0\nsqlmodel>=0.0.16\n# comment\n");
    const out = await detectManifests(dir, dir);
    expect(out[0]?.ecosystem).toBe("pypi");
    const fastapi = out[0]?.deps.find((d) => d.name === "fastapi");
    expect(fastapi?.version).toBe("0.110.0");
  });

  it("parses Cargo.toml", async () => {
    const dir = await tmpDir();
    await fs.writeFile(
      path.join(dir, "Cargo.toml"),
      `[dependencies]\naxum = "0.7"\ntokio = { version = "1.34", features = ["full"] }\n`,
    );
    const out = await detectManifests(dir, dir);
    expect(out[0]?.ecosystem).toBe("crates");
    const axum = out[0]?.deps.find((d) => d.name === "axum");
    expect(axum?.version).toBe("0.7");
  });

  it("parses go.mod", async () => {
    const dir = await tmpDir();
    await fs.writeFile(
      path.join(dir, "go.mod"),
      `module example.com/x\ngo 1.22\n\nrequire (\n  github.com/gin-gonic/gin v1.9.1\n  github.com/stretchr/testify v1.8.4\n)\n`,
    );
    const out = await detectManifests(dir, dir);
    expect(out[0]?.ecosystem).toBe("go");
    expect(out[0]?.deps.length).toBe(2);
  });

  it("returns empty list when no manifest found", async () => {
    const dir = await tmpDir();
    const out = await detectManifests(dir, dir);
    expect(out).toEqual([]);
  });
});

describe("installSuggestion", () => {
  it("renders ecosystem-appropriate commands", () => {
    expect(installSuggestion("foo", "npm")).toBe("npm install foo");
    expect(installSuggestion("foo", "pypi")).toBe("pip install foo");
    expect(installSuggestion("foo", "crates")).toBe("cargo add foo");
    expect(installSuggestion("foo", "go")).toBe("go get foo");
    expect(installSuggestion("foo", "rubygems")).toBe("bundle add foo");
  });
});
