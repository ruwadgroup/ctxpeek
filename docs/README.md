# ctxpeek docs

End-user and contributor docs. The top-level [`README.md`](../README.md) is the front door; this directory is the reference.

## Map

```ts
docs/
├── guides/
│   ├── getting-started.md       // Install + first session
│   ├── authentication.md        // GITHUB_TOKEN / GITLAB_TOKEN / BITBUCKET_TOKEN
│   ├── recipes.md               // Authoring & sharing recipes
│   ├── caching.md               // What's cached, where, for how long
│   ├── extending.md             // Add a forge / lockfile / registry plug-in
│   └── troubleshooting.md       // Windows, ENOENT, rate limits
├── reference/
│   ├── tools.md                 // Tool input / output / examples
│   ├── configuration.md         // All keys in .ctxpeek.toml
│   ├── repo-spec.md             // [forge:]owner/repo[@ref][#subpath] grammar
│   └── exit-codes.md            // CLI exit codes
├── internals/
│   ├── architecture.md          // Layer-by-layer design + plug-in registries
│   ├── fetch-strategy.md        // Cache → CDN → REST/ETag
│   └── cache.md                 // Content-addressed blob store
└── comparison.md                // ctxpeek vs Context7 vs GitMCP vs Ref Tools
```

## Conventions

- One H1 per file. The H1 is the page title.
- Code blocks always tagged with a language.
- File paths in backticks; URLs in angle brackets when bare.
- Examples favor real repos (`vercel/next.js`, `tailwindlabs/tailwindcss`) over `foo/bar`.
- Markdown is formatted by `prettier --write "**/*.md"`. Run `pnpm format:md` before committing.
