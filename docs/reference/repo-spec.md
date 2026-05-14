# Repo spec grammar

The single string `owner/repo[@ref][#subpath]` is the canonical input across every docpilot tool.

## Grammar

```ebnf
RepoSpec    = Owner "/" Repo [ "@" Ref ] [ "#" Subpath ]
Owner       = [^/@\s#]+
Repo        = [^/@\s#]+
Ref         = [^#\s]+
Subpath     = .+
```

## Rules

1. Exactly one slash inside the `owner/repo` portion. Both sides are matched **case-insensitively** against GitHub's canonical case at resolve time.
2. `@ref` accepts:
   - Branch name (`main`, `canary`, `feature/foo`)
   - Tag (`v15.0.0`, `release-2026-04`)
   - Full sha (`a3b1f7c4...` 40 chars)
   - Short sha (≥ 7 chars)
3. `#subpath` is normalized: leading slash stripped, trailing slash optional. Must be a directory in the resolved tree; if it isn't, the error response suggests the closest matching directory.

## Examples

| Spec                                                      | Resolves to            |
| --------------------------------------------------------- | ---------------------- |
| `vercel/next.js`                                          | `main` HEAD            |
| `vercel/next.js@main`                                     | `main` HEAD (explicit) |
| `vercel/next.js@v15.0.0`                                  | tag `v15.0.0`          |
| `vercel/next.js@a3b1f7c`                                  | short sha              |
| `vercel/next.js@a3b1f7c4d5e6f7…`                          | full sha               |
| `tailwindlabs/tailwindcss@main#packages/tailwindcss/docs` | monorepo subtree       |
| `python/cpython@3.13#Doc`                                 | only the `Doc/` tree   |

## Resolution

A ref → sha resolution is performed once at the start of each tool call (`/repos/{o}/{r}/git/ref/...` for symbolic refs, `/repos/{o}/{r}/commits/{sha}` for shas). The resolved sha is then used downstream — every subsequent operation in that call operates on `(owner, repo, commit_sha)`. This costs at most one REST call (ETag-cached) per session per ref.

## Why a single string

The single-string form is what fits a slash command, a chat message, or a tool input. It is also what users already type when referring to repos ("`vercel/next.js`") so there is no learning curve.
