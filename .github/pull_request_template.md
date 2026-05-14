<!--
PR title MUST be a Conventional Commit:
  feat(scope): …
  fix(scope): …
  docs: …

Allowed scopes: mcp, core, fetch, resolve, cache, index, format, recipes,
config, doctor, tools, docs, ci, deps, release, repo
-->

## What & why

<!-- One paragraph. What changed, and why. -->

## Linked issues

Closes #

## Test plan

- [ ] Unit tests added or updated
- [ ] `pnpm lint && pnpm typecheck && pnpm test` is green locally
- [ ] Tested manually against an MCP client (note which one):
- [ ] Docs updated where relevant

## Changeset

- [ ] Ran `pnpm changeset` and committed the resulting file
- [ ] OR added the `no-changeset` label because this PR has no user-visible impact

## Screenshots / output (optional)

<!-- For UI changes or notable CLI output, paste here. -->

## Reviewer checklist

- [ ] PR title is a Conventional Commit
- [ ] No new public API without a docs update
- [ ] No tokens, secrets, or `.env` files committed
