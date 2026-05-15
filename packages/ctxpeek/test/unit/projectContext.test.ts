import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findProjectManifestMatch } from "../../src/tools/projectContext.js";

const originalCwd = process.cwd();

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ctxpeek-project-context-"));
}

afterEach(() => {
  process.chdir(originalCwd);
});

describe("findProjectManifestMatch", () => {
  it("matches workspace package names and returns a monorepo subpath repo spec", async () => {
    const root = await fs.realpath(await tmpDir());
    const appDir = path.join(root, "apps", "web");
    const packageDir = path.join(root, "packages", "core");
    await fs.mkdir(appDir, { recursive: true });
    await fs.mkdir(packageDir, { recursive: true });
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "repo-root",
        repository: "git+https://github.com/acme/platform.git",
        workspaces: ["apps/*", "packages/*"],
      }),
    );
    await fs.writeFile(path.join(appDir, "package.json"), JSON.stringify({ name: "web" }));
    await fs.writeFile(path.join(packageDir, "package.json"), JSON.stringify({ name: "@acme/core" }));

    process.chdir(appDir);

    await expect(findProjectManifestMatch("acme")).resolves.toEqual({
      depName: "@acme/core",
      ecosystem: "npm",
      manifestFile: path.join(packageDir, "package.json"),
      repoSpec: "acme/platform#packages/core",
    });
  });
});
