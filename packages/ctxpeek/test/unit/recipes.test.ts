import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { loadRecipe } from "../../src/recipes.js";

describe("loadRecipe", () => {
  it("parses TOML", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ctxpeek-recipe-"));
    const file = path.join(dir, "stack.toml");
    await fs.writeFile(
      file,
      `[[repo]]
spec = "vercel/next.js@v15.0.0"
alias = "next"

[[repo]]
spec = "drizzle-team/drizzle-orm@v0.30.1"
`,
    );
    const recipe = await loadRecipe(file);
    expect(recipe.repos.length).toBe(2);
    expect(recipe.repos[0]?.alias).toBe("next");
    expect(recipe.repos[1]?.alias).toBeUndefined();
  });
});
