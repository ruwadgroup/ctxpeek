# ctxpeek

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
