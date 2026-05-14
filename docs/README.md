# docpilot docs

End-user and contributor documentation. The top-level [`README.md`](../README.md) is the front door; this directory is the deep reference.

## Map

```
docs/
├── guides/
│   ├── getting-started.md        Install + first session
│   ├── authentication.md         GITHUB_TOKEN, App, anonymous
│   ├── recipes.md                Authoring & sharing recipes
│   ├── caching.md                What's cached, where, for how long
│   └── troubleshooting.md        Windows, ENOENT, rate limits
├── reference/
│   ├── tools.md                  Every tool's input / output / examples
│   ├── configuration.md          All keys in .docpilot.toml
│   ├── repo-spec.md              owner/repo[@ref][#subpath] grammar
│   └── exit-codes.md             CLI exit codes
├── internals/
│   ├── architecture.md           Layer-by-layer design
│   ├── fetch-strategy.md         REST + ETag → CDN → GraphQL
│   └── cache.md                  Content-addressed blob store
└── comparison.md                 docpilot vs Context7 vs GitMCP vs Ref Tools
```

## Conventions

- One H1 per file. The H1 is the page title.
- Code blocks always tagged with a language.
- File paths in backticks; URLs in angle brackets when bare.
- Examples favor real repos (`vercel/next.js`, `tailwindlabs/tailwindcss`) over `foo/bar`.
- Markdown is formatted by `prettier --write "**/*.md"`. Run `pnpm format:md` before committing.
