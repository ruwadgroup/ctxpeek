# Comparison: docpilot vs Context7 vs GitMCP vs Ref Tools

A direct, non-marketing comparison. The main split is not privacy. It is the unit of retrieval.

docpilot treats documentation as a git snapshot: `[forge:]owner/repo[@ref][#subpath]`. Context7 treats documentation as a library entry in a hosted corpus. Both are useful, but they lead to different behavior when you care about an exact branch, tag, commit, or monorepo package.

| Property                | docpilot                                        | Context7                                         | GitMCP                 | Ref Tools            |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------ | ---------------------- | -------------------- |
| Retrieval model         | Git snapshot → tree → path → file               | Library ID → topic → curated context             | Repo URL → hosted docs | Configured sources   |
| Transport               | stdio (local)                                   | stdio + HTTP (hosted)                            | stdio + HTTP (hosted)  | stdio (local)        |
| Account required        | No                                              | Optional, recommended for higher quota           | Optional               | No                   |
| Trust boundary          | Your GitHub PAT, public CDN                     | Upstash registry + Custom Rules surface          | Hosted; user-trusted   | Local                |
| Ref support             | Branches, tags, shas, and `#subpath`            | Versioned library IDs when available             | Limited                | Per-source           |
| Data freshness          | Reads the requested ref from the forge          | Depends on corpus ingestion / refresh            | On-demand fetch        | On-demand            |
| Library coverage        | Any public repo on GitHub, GitLab, or Bitbucket | Curated registry                                 | Any public GitHub repo | Configured docs sets |
| Version pinning         | `[forge:]owner/repo@ref` first-class            | `/owner/lib/version` or `/owner/lib@version`     | Limited                | Per-source           |
| Privacy                 | Queries never leave your machine                | Every query → context7.com                       | Query → gitmcp.io      | Local                |
| Prompt-injection vector | None (no third-party instruction channel)       | Patched ContextCrush; structural concern remains | Hosted; theoretical    | Minimal              |
| Cost                    | Free, your rate limits                          | Free tier + paid tiers                           | Free                   | Free                 |
| Response format         | Markdown by default                             | JSON-flavored text payloads                      | Markdown               | Markdown             |
| Token efficiency        | Tree + frontmatter; self-reports cost           | Larger; users report bloat                       | Medium                 | Tight                |
| Offline cache           | Yes, content-addressed                          | No (hosted)                                      | No (hosted)            | Partial              |
| Search shape            | Path-based (agentic; tree → path → file)        | Top-k snippets from a hosted index               | URL-based              | Per-source index     |
| Fuzzy name resolution   | npm/PyPI/crates first, GitHub last              | Internal trust-scored registry                   | URL-based              | N/A                  |
| Monorepo subpath        | First-class `#subpath`                          | Limited                                          | Limited                | N/A                  |
| Code search             | Out of scope (use github-mcp-server)            | Code snippets included                           | Code search            | No                   |
| License (server)        | Apache-2.0                                      | Custom (npm package MIT; service ToS bind)       | MIT                    | Closed/freemium      |

## When to pick which

- **docpilot** — you care which branch, tag, commit, or monorepo subpath the docs came from. You want the source repo to stay the authority.
- **Context7** — you want curated topic context for a known library and the available corpus/version is good enough for the task.
- **GitMCP** — hosted equivalent of "give me docs from owner/repo" without local install.
- **Ref Tools** — narrowly-scoped, hand-curated docs sets per project (your team's internal notes plus a fixed set of vendor docs).

These aren't strictly substitutes. Running docpilot alongside Context7 or Ref Tools is fine — the MCP transport is shared and the model picks per call.

## Different Thinking Model

Context7's natural flow is:

```text
resolve-library-id("nextjs")
get-library-docs("/vercel/next.js", topic: "routing", tokens: 3000)
```

docpilot's natural flow is:

```text
list_docs("vercel/next.js@v15.0.0")
search_docs("vercel/next.js@v15.0.0", "routing")
fetch_doc("vercel/next.js@v15.0.0", "docs/.../routing.mdx")
get_changes("vercel/next.js", path: "docs/.../routing.mdx", from_ref: "v14.2.0", to_ref: "v15.0.0")
```

That difference matters. A hosted corpus can be excellent at answering "what are the relevant docs for this topic?" docpilot is better at "what did the docs say at this exact ref, and how did they change between these refs?"

Privacy, accounts, and local caching are real benefits, but they are downstream from this design. The core bet is that source repos already contain the best address space for docs: branches, tags, shas, directories, filenames, and changelogs.

## What docpilot is not

- **A source-code-understanding tool.** For symbol-level navigation use [`github-mcp-server`](https://github.com/github/github-mcp-server) or [`deepwiki`](https://deepwiki.com).
- **A hosted docs corpus.** Optional immutable mirrors are compatible with the design; a hosted resolver/index that decides which docs the model sees is not.
- **A semantic search engine.** `search_docs` scores doc paths, `list_docs` returns the tree — agentic clients navigate from there. Vector retrieval re-derives relevance the corpus author already encoded in filenames, folders, and llms.txt; we trust that signal instead. Full rationale: [Why no semantic search](internals/architecture.md#why-no-semantic-search-or-vector-store-a-deliberate-choice).
- **A curated library registry.** If a library has a public repo on a supported forge, docpilot can read it.
- **A read-write tool.** No `create_issue`, no `commit`, no `pr`. Adjacent to scope.
