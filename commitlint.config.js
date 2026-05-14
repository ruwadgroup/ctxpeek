/**
 * Conventional Commits enforced on PR titles (via .github/workflows/pr-title.yml)
 * and on local commits (via .husky/commit-msg).
 *
 * Allowed types:
 *   feat      new feature
 *   fix       bug fix
 *   docs      documentation only
 *   refactor  no behavior change
 *   perf      performance improvement
 *   test      tests only
 *   build     build system / deps
 *   ci        CI configuration
 *   chore     repo housekeeping
 *   revert    revert previous commit
 *
 * Allowed scopes (optional but recommended):
 *   mcp, core, fetch, resolve, cache, index, format, recipes, config, doctor,
 *   tools, docs, ci, deps, release
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "refactor", "perf", "test", "build", "ci", "chore", "revert"],
    ],
    "scope-enum": [
      1,
      "always",
      [
        "mcp",
        "core",
        "fetch",
        "resolve",
        "cache",
        "index",
        "format",
        "recipes",
        "config",
        "doctor",
        "tools",
        "docs",
        "ci",
        "deps",
        "release",
        "repo",
      ],
    ],
    "subject-case": [2, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [1, "always", 200],
  },
};
