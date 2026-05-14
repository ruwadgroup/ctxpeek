# Example recipes

Drop-in `.docpilot.recipe.toml` bundles for common stacks. Install one with:

```bash
npx -y docpilot recipe install ./next-drizzle-clerk.toml
```

| Recipe                                                         | Stack                                       |
| -------------------------------------------------------------- | ------------------------------------------- |
| [`next-drizzle-clerk.toml`](next-drizzle-clerk.toml)           | Next.js 15 + Drizzle ORM + Clerk + Tailwind |
| [`python-fastapi-sqlmodel.toml`](python-fastapi-sqlmodel.toml) | FastAPI + SQLModel + Pydantic               |
| [`rust-axum-tokio.toml`](rust-axum-tokio.toml)                 | Axum + Tokio + sqlx                         |

PRs welcome — see [docs/guides/recipes.md](../../docs/guides/recipes.md) for the format.
