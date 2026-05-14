# @docpilot/core

Shared types and error classes used by the docpilot MCP server.

This package is **internal** to the docpilot monorepo. It is not published to npm independently; consumers should depend on `docpilot` directly.

## Layout

```ts
src/
├── types/
│   ├── repoSpec.ts       // Forge + RepoSpec + RepoSpecString brand
│   ├── snapshot.ts       // Snapshot + BlobRef
│   └── toolResult.ts     // MCP-shaped ToolResult
├── errors.ts             // DocpilotError hierarchy
└── index.ts              // Barrel
```

## Why a separate package

1. **Type clarity.** Tool inputs/outputs and IR types are stable contracts; isolating them lets the MCP server refactor without touching the type surface.
2. **Future polyglot clients.** A docpilot HTTP companion or external CLI helper imports `@docpilot/core` rather than reaching into the server.
3. **Test isolation.** Error semantics and type shapes can be exercised without spinning up the MCP transport.

## Build

```bash
pnpm --filter @docpilot/core build
```
