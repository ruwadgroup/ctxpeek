# Security Policy

## Supported Versions

ctxpeek is pre-1.0. Only the latest minor release on the `main` branch is supported with security fixes.

| Version          | Supported |
| ---------------- | --------- |
| `0.x.y` (latest) | yes       |
| anything older   | no        |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security reports.

Instead, use one of:

1. **GitHub private vulnerability reporting** — preferred. Open <https://github.com/tamimbinhakim/ctxpeek/security/advisories/new>.
2. Email <security@ctxpeek.dev> with a description and reproduction steps.

We aim to acknowledge receipt within 72 hours and to provide a remediation plan within 7 days for high-severity issues.

## Scope

In scope:

- The `ctxpeek` npm package and its runtime behavior
- The `ctxpeek` CLI binary
- Configuration parsing (`.ctxpeek.toml`, `.ctxpeek.recipe.toml`)
- Cache integrity (snapshot-addressed blob store)
- Token handling (`GITHUB_TOKEN`, `GITLAB_TOKEN`, `BITBUCKET_TOKEN`, and `gh auth token`)
- The repo string parser (`owner/repo[@ref][#subpath]`)

Out of scope:

- Third-party MCP clients (report to their maintainers)
- GitHub API or jsDelivr CDN behavior
- Denial-of-service via large public repos (we have explicit caps; tuning advice in [docs/guides/caching.md](docs/guides/caching.md))

## Threat model summary

ctxpeek's premise is that **the canonical source for a library's docs is its git repository**. The threat model follows from that:

- We trust the bytes from `github.com/{owner}/{repo}` and the same content via jsDelivr (commit-pinned).
- We do **not** introduce a third-party instruction channel that could carry prompt-injection payloads (no registry, no "custom rules" surface).
- Recipes are user-trusted input — installing a recipe from a stranger extends trust to whichever repos that recipe pins. This is documented in [docs/guides/recipes.md](docs/guides/recipes.md).
- Tokens are read from the local CLI/env/`gh auth` source and only used in request headers for the matching forge API. They are never logged or transmitted elsewhere.

## Disclosure

We follow coordinated disclosure. Once a fix is available we publish a GitHub Security Advisory with credit to the reporter (or anonymously, if requested) and a CVE where applicable.
