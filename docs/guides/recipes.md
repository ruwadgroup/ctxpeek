# Recipes

A **recipe** is a TOML file that bundles pre-pinned repos and (optionally) aliases. Installing a recipe pre-warms the cache, builds the search index, and registers aliases your model can use directly.

## Why recipes exist

Two scenarios:

1. **Project-local stability.** Your team uses a fixed stack — Next.js 15, Drizzle 0.30, Clerk v5 — and you'd like every contributor (and CI) to query the same versions deterministically.
2. **Cold-start avoidance.** The first time docpilot sees a repo, it does a tree fetch + a few file reads. Recipes do that work once, ahead of time.

## Format

`.docpilot.recipe.toml`:

```toml
[[repo]]
spec  = "vercel/next.js@v15.0.0"
alias = "next"

[[repo]]
spec  = "drizzle-team/drizzle-orm@v0.30.1"
alias = "drizzle"

[[repo]]
spec  = "clerk/javascript@v5#packages/clerk-js"
alias = "clerk"

# Anything in [[repo]] is also a docpilot tool input — full owner/repo[@ref][#subpath].
```

Aliases are resolved to the underlying spec at tool-call time, so `fetch_doc("next", "...")` is equivalent to `fetch_doc("vercel/next.js@v15.0.0", "...")`.

## Installing

```bash
# From a local file
npx -y docpilot recipe install ./.docpilot.recipe.toml

# From a URL (gist, repo, anything)
npx -y docpilot recipe install \
  https://github.com/your-org/stack/raw/main/.docpilot.recipe.toml
```

Idempotent — re-running just revalidates ETags and re-pins refs to current shas.

## Sharing

Recipes are plain TOML. Common patterns:

- Commit `.docpilot.recipe.toml` into your repo's root
- Publish a gist for ad-hoc sharing
- Maintain a curated list under `awesome-docpilot-recipes` (community)

## Trust

Recipes are **user-trusted input**. A recipe can pin to any public repo on GitHub, and that repo's content is delivered to your assistant. There is no centralized registry of "verified" recipes; if you install a recipe from a stranger, you are extending trust to whatever repos that recipe pins.

This is the same trust posture as `npm install` from a stranger's package.json. Read recipes before installing them, and prefer recipes that pin to specific tags or shas (not `@main`).

## Examples

See [`examples/recipes/`](../../examples/recipes/) for ready-to-use recipes:

- `next-drizzle-clerk.toml` — Next.js + Drizzle + Clerk
- `python-fastapi-sqlmodel.toml` — FastAPI + SQLModel
- `rust-axum-tokio.toml` — Axum + Tokio + sqlx
