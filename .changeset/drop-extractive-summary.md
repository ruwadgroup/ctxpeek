---
"docpilot": patch
---

Remove the auto-generated `summary` field from `fetch_doc` frontmatter.

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
