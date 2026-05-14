# Contributing to docpilot

Thanks for your interest in contributing. This document covers what we expect from contributions and how to get a working dev environment.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating you agree to abide by its terms.

## Reporting issues

For **security issues**, please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

For everything else, open an issue at <https://github.com/docpilot/docpilot/issues>. Pick the matching template (bug, feature, docs). Include:

1. The output of `npx -y docpilot-mcp doctor` (redact your token)
2. Your MCP client + version
3. The exact failing tool call (or expected behavior)

## Development setup

### Prerequisites

- Node.js **≥ 20** (use `.nvmrc`: `nvm use`)
- pnpm **≥ 9** (`corepack enable && corepack prepare pnpm@9 --activate`)
- Optional: Python 3.11+ if you'll touch anything in `scripts/`

### Clone & install

```bash
git clone https://github.com/docpilot/docpilot.git
cd docpilot
pnpm install
pnpm build
pnpm test
```

### Run from source

```bash
pnpm --filter docpilot-mcp dev
```

This runs the server from `src/` with `tsx watch`. To attach a real MCP client to your local build, point its config at the absolute path:

```jsonc
{
  "mcpServers": {
    "docpilot-dev": {
      "command": "node",
      "args": ["/abs/path/to/docpilot/packages/docpilot-mcp/dist/server.js"],
    },
  },
}
```

## Project layout

See [README.md](README.md#documentation) for the full doc map. The short version:

```
packages/
  docpilot-mcp/        the npm package shipped to users
  docpilot-core/       shared types and errors (internal)
docs/
  guides/              how-to articles
  reference/           tool / config / spec references
  internals/           architecture, fetch strategy, cache
examples/
  recipes/             sample .docpilot.recipe.toml files
.github/workflows/     CI/CD pipelines
```

## Code style

- **TypeScript** for runtime code. Strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- **oxlint + oxfmt** for JS/TS lint and format. Configured in `.oxlintrc.json` and `.oxfmtrc.json`.
- **prettier** for **markdown only**. JS/TS is handled by oxfmt; YAML/TOML/Python by their own tools.
- **ruff** for Python. Configured in `ruff.toml`.
- **Conventional Commits** enforced on PR titles and local commits via husky + commitlint. See `commitlint.config.js` for allowed types and scopes.

Run all checks:

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
```

Auto-fix formatting:

```bash
pnpm format
```

## Tests

- **Unit tests** (`packages/*/test/unit/**`): vitest, fast, no network. Run via `pnpm test`.
- **Integration tests** (`packages/docpilot-mcp/test/integration/**`): vitest, hits real GitHub. Skipped in CI unless `GITHUB_TOKEN` is set as a secret. Run locally via `pnpm --filter docpilot-mcp test:integration`.
- **Fixtures** live in `test/fixtures/`. For HTTP, prefer MSW (`msw`) over snapshots of real responses.

A new feature must come with at least one unit test.

## Pull requests

1. Branch from `main` with a descriptive name (`feat-cdn-fallback`, `fix-windows-spawn`).
2. Make your change. Add a [changeset](https://github.com/changesets/changesets) describing the user-visible impact:
   ```bash
   pnpm changeset
   ```
3. Push and open a PR. The PR title must be a Conventional Commit (`feat(fetch): …`, `fix(cache): …`, `docs: …`).
4. Wait for CI green: `lint`, `typecheck`, `test`, `format:check`, `dependency-review`.
5. Address review comments. Squash-merge is the norm.

## Releases

Releases are managed by [changesets](https://github.com/changesets/changesets) via `.github/workflows/release.yml`:

1. Each user-visible change gets a `pnpm changeset` entry on the PR.
2. The release workflow opens a "Version Packages" PR that aggregates pending changesets.
3. Merging that PR publishes to npm and tags the release.

## Asking for help

- General questions: GitHub Discussions
- Real-time chat: linked from the README when we have it
- Security: <security@docpilot.dev> (see [SECURITY.md](SECURITY.md))
