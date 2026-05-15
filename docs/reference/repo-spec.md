# Repo spec grammar

The single string `[forge:]owner/repo[@ref][#subpath]` is the canonical input across every docpilot tool.

This format is the product model, not just syntax. docpilot does not ask an agent to pick a hosted library ID and hope the right version is indexed. It asks for the source repo plus the exact git address the user cares about: default branch, release tag, feature branch, commit sha, and optionally a monorepo subdirectory.

## Grammar

```ebnf
RepoSpec    = [ ForgePrefix ":" ] Owner "/" Repo [ "@" Ref ] [ "#" Subpath ]
ForgePrefix = [A-Za-z][A-Za-z0-9_-]*
Owner       = [^/@\s#]+
Repo        = [^/@\s#]+
Ref         = [^#\s]+
Subpath     = .+
```

## Forge prefixes

The optional forge prefix selects which git host docpilot talks to. Bare specs default to GitHub.

| Prefix               | Forge           | Notes                               |
| -------------------- | --------------- | ----------------------------------- |
| _none_               | GitHub          | Default                             |
| `gh:`                | GitHub          | Explicit alias                      |
| `github:`            | GitHub          | Explicit canonical                  |
| `gl:` / `gitlab:`    | GitLab          | `GITLAB_TOKEN` for private repos    |
| `bb:` / `bitbucket:` | Bitbucket Cloud | `BITBUCKET_TOKEN` for private repos |

Additional forges (Codeberg, Gitea, sourcehut, …) can be added by dropping one file into [`packages/docpilot/src/fetch/forges/`](../../packages/docpilot/src/fetch/forges/) — see [extending docpilot](../guides/extending.md).

## Rules

1. Exactly one slash inside the `owner/repo` portion. Both sides are matched **case-insensitively** against the canonical case at resolve time.
2. `@ref` accepts:
   - Branch name (`main`, `canary`, `feature/foo`)
   - Tag (`v15.0.0`, `release-2026-04`)
   - Full sha (`a3b1f7c4...` 40 chars)
   - Short sha (≥ 7 chars)
3. `#subpath` is normalized: leading slash stripped, trailing slash optional.

## Examples

| Spec                                                      | Resolves to             |
| --------------------------------------------------------- | ----------------------- |
| `vercel/next.js`                                          | GitHub `main` HEAD      |
| `vercel/next.js@v15.0.0`                                  | GitHub tag `v15.0.0`    |
| `vercel/next.js@a3b1f7c`                                  | GitHub short sha        |
| `tailwindlabs/tailwindcss@main#packages/tailwindcss/docs` | GitHub monorepo subtree |
| `python/cpython@3.13#Doc`                                 | GitHub `Doc/` tree      |
| `gitlab:gitlab-org/gitlab@master`                         | GitLab `master`         |
| `gl:gitlab-org/gitlab@v17.0.0#doc`                        | GitLab tag + subpath    |
| `bitbucket:atlassian/python-bitbucket@main`               | Bitbucket Cloud         |

## Resolution

A ref → sha resolution is performed once at the start of each tool call. The resolved sha is then used downstream — every subsequent operation in that call operates on `(forge, owner, repo, commit_sha)`. The mapping is cached on disk for 24h per `(forge, ref)`.

## Why a single string

The single-string form fits a slash command, a chat message, or a tool input. It's what people already type when referring to repos ("`vercel/next.js`") — no learning curve.

It also keeps version intent attached to every tool call. `list_docs`, `fetch_doc`, `get_changes`, and `changelog` all speak the same ref-native language, so an agent can move from "show me Next 15 routing docs" to "compare that file with Next 14" without switching systems.
