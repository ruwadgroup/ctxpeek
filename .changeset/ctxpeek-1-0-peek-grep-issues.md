---
"ctxpeek": major
---

ctxpeek 1.0 — `peek` gains a grep mode and edge-case hardening, and `get_issues` learns rich filtering plus a read-one mode.

**`peek`**

- **Grep mode**: pass `query` to find every match inside a named file and get each one back with `context` lines around it. Literal by default; `regex: true` for patterns; `ignore_case` (default true). The search is a deterministic grep scoped to the one file you named — navigation, not a vector store.
- **Limits**: `max_line_length` truncates over-long lines (both modes) so a minified/data line can't blow the context window; `max_matches` caps grep results with an explicit "+N more" note; `n` (head mode) is capped.
- **Edge cases**: binary files (NUL byte in the first 8 KB) and empty files are reported, never dumped; no-match queries return a friendly note instead of an error; an invalid regex reports the syntax error. The `~tokens` frontmatter now reflects the returned payload.

**`get_issues`**

- **Filtering**: `labels`, `author`, `assignee`, `since`, and `sort`/`order` (updated/created/comments) on top of the existing `state`/`type`. The REST and GraphQL paths now share one query builder so filters behave identically.
- **Read one**: pass `number` to fetch a single issue/PR's full body plus its first `comments` comments.

**Stabilization**: new pure, unit-tested modules (`format/peekText`, `fetch/issueQuery`); the tool surface stays at 10 tools.
