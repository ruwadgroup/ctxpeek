# ctxpeek

## 1.0.0

### Major Changes

- [#32](https://github.com/tamimbinhakim/ctxpeek/pull/32) [`625892c`](https://github.com/tamimbinhakim/ctxpeek/commit/625892cde1514420e52336dfba38a9d812c9d940) Thanks [@tamimbinhakim](https://github.com/tamimbinhakim)! - ctxpeek 1.0 — `peek` gains a grep mode and edge-case hardening, and `get_issues` learns rich filtering plus a read-one mode.

  **`peek`**
  - **Grep mode**: pass `query` to find every match inside a named file and get each one back with `context` lines around it. Literal by default; `regex: true` for patterns; `ignore_case` (default true). The search is a deterministic grep scoped to the one file you named — navigation, not a vector store.
  - **Limits**: `max_line_length` truncates over-long lines (both modes) so a minified/data line can't blow the context window; `max_matches` caps grep results with an explicit "+N more" note; `n` (head mode) is capped.
  - **Edge cases**: binary files (NUL byte in the first 8 KB) and empty files are reported, never dumped; no-match queries return a friendly note instead of an error; an invalid regex reports the syntax error. The `~tokens` frontmatter now reflects the returned payload.

  **`get_issues`**
  - **Filtering**: `labels`, `author`, `assignee`, `since`, and `sort`/`order` (updated/created/comments) on top of the existing `state`/`type`. The REST and GraphQL paths now share one query builder so filters behave identically.
  - **Read one**: pass `number` to fetch a single issue/PR's full body plus its first `comments` comments.

  **Stabilization**: new pure, unit-tested modules (`format/peekText`, `fetch/issueQuery`); the tool surface stays at 10 tools.

## 0.1.3

### Patch Changes

- [`2508115`](https://github.com/tamimbinhakim/ctxpeek/commit/25081150734b261dcf81a8c28a0ab0640892df46) Thanks [@tamimbinhakim](https://github.com/tamimbinhakim)! - Patch the dev-dep toolchain: bump `vitest` 2.x → 4.x, refreshing the
  transitive `vite` peer (5.4.21 → 8.0.13) and `esbuild` to versions patched
  against:
  - CVE-2026-39365 — vite path traversal in `.map` handling (≤6.4.1)
  - GHSA-67mh-4wv8-2f99 — esbuild dev-server CORS (≤0.24.2)

  No runtime changes; published artifact is unaffected. This release exists
  to refresh the SBOM and provenance attestation against an audit-clean
  dependency tree (`pnpm audit` and `pnpm audit --prod` both report 0
  vulnerabilities).

## 0.1.2

### Patch Changes

- Fix release hygiene for the MCP package: report the runtime version from package metadata, make the MCP boot integration test wait for server readiness, ship the full Apache license in the npm tarball, and expand the npm README with the Context7 vs ctxpeek agent-flow explanation.

## 0.1.1

### Patch Changes

- [#17](https://github.com/tamimbinhakim/ctxpeek/pull/17) [`8de308d`](https://github.com/tamimbinhakim/ctxpeek/commit/8de308dcfb5e852d83b6241fe552fa65ec16f055) Thanks [@tamimbinhakim](https://github.com/tamimbinhakim)! - Remove the auto-generated `summary` field from `fetch_doc` frontmatter.

  The summary was a local extractive build (lead-sentence-of-top-N-sections by
  length, no model call). In practice it:
  - Added a parallel, lower-quality restatement of content the assistant was
    about to read in full anyway — pure context noise.
  - Truncated mid-word on long sections, producing garbled fragments like
    "build the espace:" (clipped from "build the namespace:").
  - Lived in a YAML envelope without proper multi-line/folded quoting, so a
    long summary could leave an unterminated `"` and bleed into the doc body,
    corrupting the frame Claude (or any client) was parsing.

  `fetch_doc` now returns just `repo / ref / commit / path / size / source /
~tokens` in frontmatter, then the doc body. If a summary is ever
  reintroduced, it should be model-generated and rendered outside the YAML
  frame (or properly block-quoted with `|`).

## 0.0.0

Initial scaffold and pre-release package metadata.

See the [roadmap](../../README.md#roadmap) for current baseline status and future planning.
