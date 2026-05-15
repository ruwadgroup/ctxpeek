# Authentication

ctxpeek is local-first. There is no ctxpeek account; tokens are only used to authenticate against the forge APIs that serve the repos you ask for.

## Modes, autodetected

| Mode                       | What you provide            | Notes                                               |
| -------------------------- | --------------------------- | --------------------------------------------------- |
| **Anonymous**              | nothing                     | GitHub REST is 60 req/hr per IP; CDN reads are free |
| **GitHub token**           | `GITHUB_TOKEN` or `--token` | Higher REST quota; `gh auth token` is also detected |
| **GitLab token**           | `GITLAB_TOKEN`              | Used for `gitlab:` / `gl:` repo specs               |
| **Bitbucket bearer token** | `BITBUCKET_TOKEN`           | Used for `bitbucket:` / `bb:` repo specs            |

## Personal Access Token (PAT)

A **fine-grained PAT** with `Contents: Read` on public repositories is enough for public GitHub docs.

1. Go to <https://github.com/settings/tokens?type=beta>
2. Create a new token with:
   - Resource owner: yourself or an org
   - Repository access: `Public repositories (read-only)`
   - Permissions: `Contents — Read-only`, `Metadata — Read-only`
3. Set it in your MCP client config:

```jsonc
{
  "mcpServers": {
    "ctxpeek": {
      "command": "npx",
      "args": ["-y", "ctxpeek"],
      "env": { "GITHUB_TOKEN": "github_pat_…" }
    }
  }
}
```

A classic PAT with the `public_repo` scope works equivalently for public repos. If you need private GitHub repos, the token must have access to those repositories and their contents.

### Why authed 304s matter

Unauthenticated `If-None-Match` requests still count against the 60/hr anonymous bucket. Authenticated 304s do not. ctxpeek prefers local cache and CDN reads where possible, and uses conditional REST requests when it falls back to GitHub's contents API.

## Token discovery

GitHub token discovery order:

1. `--token <pat>` CLI flag
2. The env var named by `[auth] github_token_env` (default `GITHUB_TOKEN`)
3. `GITHUB_TOKEN` as a fallback when `github_token_env` points elsewhere
4. `gh auth token` if the GitHub CLI is installed and logged in
5. None — anonymous mode

GitLab and Bitbucket tokens are read directly from `GITLAB_TOKEN` and `BITBUCKET_TOKEN` when those forge specs are used.

## Anonymous

If you set no token, ctxpeek defaults to the jsDelivr CDN for raw content (commit-pinned URLs are essentially permanently cached) and only falls through to anonymous REST for endpoints the CDN cannot serve. This is enough for casual use but you'll feel the 60/hr cap on repos that need many tree walks.

## Privacy

Your token never leaves the ctxpeek process running on your machine. It is read from the CLI flag, env var, or `gh auth token`, then used only for the matching forge API request headers. ctxpeek has no telemetry and makes no network call to any host outside the [allow-list](../../README.md#privacy).
