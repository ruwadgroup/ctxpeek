# @docpilot/core

Shared types, schemas, and error classes used by the docpilot MCP server.

This package is **internal** to the docpilot monorepo. It is not published to npm in v0.1; consumers should depend on `docpilot` directly.

## Layout

```
src/
├── types/      # plain TS types: RepoSpec, Snapshot, BlobRef, ToolResult, …
├── schema/     # zod input/output schemas shared across tools
├── errors/     # typed error classes (NotFoundError, RateLimitError, …)
└── index.ts    # re-exports
```

## Why a separate package?

Three reasons:

1. **Type clarity.** Tool inputs/outputs and IR types are stable contracts. Putting them in their own package keeps the MCP server free to refactor without touching the type surface.
2. **Future polyglot clients.** If a docpilot HTTP companion or CLI helper appears, it imports `@docpilot/core` rather than reaching into the server.
3. **Test isolation.** Schemas and parsers can be exercised without spinning up the MCP transport.

## Build

```bash
pnpm --filter @docpilot/core build
```
