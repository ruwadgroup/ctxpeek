# Authentication

docpilot is a local-first MCP server. The only entity that "authenticates" is **your** GitHub identity, and only against GitHub's API. There is no docpilot account.

## Three tiers, autodetected

| Tier                  | What you provide                       | Rate limit                               | When to use            |
| --------------------- | -------------------------------------- | ---------------------------------------- | ---------------------- |
| **Anonymous**         | nothing                                | 60 REST/hr per IP; CDN unmetered         | Casual experimentation |
| **PAT** (recommended) | `GITHUB_TOKEN` env var                 | 5,000 REST/hr; conditional 304s are free | Daily use              |
| **GitHub App**        | `GITHUB_APP_ID` + `GITHUB_PRIVATE_KEY` | up to 15,000 REST/hr                     | Org-wide deployments   |

## Personal Access Token (PAT)

A **fine-grained PAT** with `Contents: Read` on public repositories is enough.

1. Go to <https://github.com/settings/tokens?type=beta>
2. Create a new token with:
   - Resource owner: yourself or an org
   - Repository access: `Public repositories (read-only)`
   - Permissions: `Contents — Read-only`, `Metadata — Read-only`
3. Set it in your MCP client config:

```jsonc
{
  "mcpServers": {
    "docpilot": {
      "command": "npx",
      "args": ["-y", "docpilot"],
      "env": { "GITHUB_TOKEN": "github_pat_…" }
    }
  }
}
```

A classic PAT with the `public_repo` scope works equivalently.

### Why authenticated 304s are the most important flag to flip

Unauthenticated `If-None-Match` requests still count against the 60/hr anonymous bucket. **Authenticated** 304s do not. After the first session against a repo, almost every subsequent fetch is a free 304 — meaning a docpilot user with a PAT effectively has unlimited capacity for repeat reads.

## Token discovery

In order:

1. `GITHUB_TOKEN` env var (canonical)
2. `gh auth token` if `gh` is on `PATH` and `--use-gh` is set
3. `~/.config/docpilot/token` (fallback)
4. None — anonymous mode

## GitHub App (advanced)

For shared CI or org-wide deployments:

```bash
export GITHUB_APP_ID=123456
export GITHUB_PRIVATE_KEY_PATH=~/.config/docpilot/app.pem
```

docpilot refreshes the installation token every 50 minutes (1-hr expiry).

## Anonymous

If you set no token, docpilot defaults to the jsDelivr CDN for raw content (commit-pinned URLs are essentially permanently cached) and only falls through to anonymous REST for endpoints the CDN cannot serve. This is enough for casual use but you'll feel the 60/hr cap on repos that need many tree walks.

## Privacy

Your token never leaves the docpilot process running on your machine. It is read from the env var (or the configured fallback), used in the `Authorization` header for `api.github.com` requests, and that's it. docpilot has no telemetry and makes no network call to any host outside the [allow-list](../../README.md#privacy).
