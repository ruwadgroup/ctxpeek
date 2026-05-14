# Comparison: docpilot vs Context7 vs GitMCP vs Ref Tools

A direct, non-marketing comparison.

| Property                | docpilot                                  | Context7                                         | GitMCP                 | Ref Tools            |
| ----------------------- | ----------------------------------------- | ------------------------------------------------ | ---------------------- | -------------------- |
| Transport               | stdio (local)                             | stdio + HTTP (hosted)                            | stdio + HTTP (hosted)  | stdio (local)        |
| Account required        | No                                        | Optional, recommended for higher quota           | Optional               | No                   |
| Trust boundary          | Your GitHub PAT, public CDN               | Upstash registry + Custom Rules surface          | Hosted; user-trusted   | Local                |
| Data freshness          | ETag-revalidated on read; min round-trip  | Periodic re-index; days lag on new releases      | On-demand fetch        | On-demand            |
| Library coverage        | Any public GitHub repo                    | Curated registry                                 | Any public GitHub repo | Configured docs sets |
| Version pinning         | `owner/repo@ref` first-class              | `/owner/lib/vX.Y.Z` slash form                   | Limited                | Per-source           |
| Privacy                 | Query strings never leave your machine    | Every query → context7.com                       | Query → gitmcp.io      | Local                |
| Prompt-injection vector | None (no third-party instruction channel) | Patched ContextCrush; structural concern remains | Hosted; theoretical    | Minimal              |
| Cost                    | Free, your rate limits                    | Free tier + paid tiers                           | Free                   | Free                 |
| Response format         | Markdown by default                       | JSON-flavored text payloads                      | Markdown               | Markdown             |
| Token efficiency        | Tree+frontmatter; self-reports cost       | Larger; users report bloat                       | Medium                 | Tight                |
| Offline cache           | Yes, content-addressed                    | No (hosted)                                      | No (hosted)            | Partial              |
| Fuzzy name resolution   | npm/PyPI/crates first, GitHub last        | Internal trust-scored registry                   | URL-based              | N/A                  |
| Monorepo subpath        | First-class `#subpath`                    | Limited                                          | Limited                | N/A                  |
| Code search             | Not in scope (use github-mcp-server)      | Code snippets included                           | Code search            | No                   |
| License (server)        | Apache-2.0                                | Custom (npm package MIT; service ToS bind)       | MIT                    | Closed/freemium      |

## When to pick which

- **docpilot** — you want local-first, version-pinned, registry-free reads of any public repo, and you are OK supplying a GitHub PAT for higher throughput.
- **Context7** — you want a hosted, curated, "it just works" experience, and the trust posture and registry coverage are acceptable for your use case.
- **GitMCP** — you want a hosted equivalent of "give me docs from owner/repo" without local install, and you're OK with that trust boundary.
- **Ref Tools** — you want narrowly-scoped, hand-curated docs sets per project (e.g., your team's internal notes plus a fixed set of vendor docs).

These are not strictly substitutes — running docpilot alongside Context7 or Ref Tools is fine. The MCP transport is shared; the model picks per call.

## What docpilot is not

- A source-code-understanding tool. For symbol-level navigation, use [`github-mcp-server`](https://github.com/github/github-mcp-server) or [`deepwiki`](https://deepwiki.com).
- A hosted SaaS. Architectural decision; if we run a server, we become Context7.
- A vector index in v1. BM25+ is good enough for docs corpora typically ≤10 MB per repo. Vectors are an opt-in v0.3+ experiment.
- A curated library registry. We will never maintain a "trusted libraries" list. If a library has a public GitHub repo, docpilot can read it.
- A read-write tool. No `create_issue`, no `commit`, no `pr`. Adjacent to scope.
