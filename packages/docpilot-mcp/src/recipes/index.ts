/**
 * Recipes — shareable bundles of pre-pinned repos.
 *
 *   docpilot recipe install ./.docpilot.recipe.toml
 *
 * Pre-warms cache, builds indexes, registers aliases. See design doc §12.3.
 *
 * Trust note: recipes are user-trusted input (see §18 #9).
 */
export interface RecipeRepo {
  readonly spec: string;
  readonly alias: string | undefined;
}

export interface Recipe {
  readonly repos: ReadonlyArray<RecipeRepo>;
}

export async function loadRecipe(_path: string): Promise<Recipe> {
  // TODO(v0.1, week-3): smol-toml parse + schema validation
  throw new Error("not implemented");
}

export async function installRecipe(_recipe: Recipe): Promise<void> {
  // TODO(v0.1, week-3): walk repos, prefetch tree + key files
  throw new Error("not implemented");
}
