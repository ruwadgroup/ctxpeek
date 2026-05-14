# Troubleshooting

When in doubt, run the doctor:

```bash
npx -y docpilot doctor
```

It catches roughly 80% of "it just doesn't work" reports.

## `spawn npx ENOENT` on Windows

The single most common failure across MCP clients on Windows. `npx` is a `.cmd` shim, not an `.exe`, and child-process spawn from non-shell contexts cannot find it.

**Fix:** use the explicit shell wrapper.

```jsonc
{
  "mcpServers": {
    "docpilot": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "docpilot"]
    }
  }
}
```

Same fix applies to Cursor, Cline, VS Code Insiders, Windsurf, and Claude Desktop.

## `command not found: docpilot` after install

You probably installed globally with a tool that doesn't expose binaries to `PATH`. Use `npx -y docpilot` directly in the client config — that always works because npm cache resolution doesn't depend on `PATH`.

## Rate-limited

If you see "GitHub: API rate limit exceeded for {ip}", you're running anonymous and bumped into the 60/hr REST cap. Two options:

1. Set `GITHUB_TOKEN` (jumps to 5,000/hr; ETag 304s become free).
2. Wait an hour. The CDN-served path keeps working in the meantime.

Check your remaining budget any time:

```bash
npx -y docpilot cache status
```

The status output includes a "GitHub remaining: N/5000" line.

## "Library not found" from `resolve_repo`

By design, docpilot returns `Ambiguous` (top-5 candidates) rather than guessing. If you got `NotFound`, the registry probes (npm, PyPI, crates, RubyGems, …) and a GitHub `/search/repositories` query all came back empty.

Bypass the resolver: pass `owner/repo` directly. docpilot only resolves fuzzy names — canonical specs go straight through.

```text
fetch_doc("vercel/next.js", "docs/getting-started.mdx")
```

## Cache feels stale

Pin a ref:

```text
list_docs("vercel/next.js@main")     # always tip of main
list_docs("vercel/next.js@v15.0.0")  # always v15.0.0
```

Or evict by deleting the cache dir:

```bash
rm -rf ~/Library/Caches/docpilot   # macOS
rm -rf ~/.cache/docpilot           # Linux
```

## Tools don't appear in the client

1. Check the client log (Claude Desktop: `~/Library/Logs/Claude/mcp*.log`).
2. Run docpilot directly to surface the underlying error:

   ```bash
   npx -y docpilot
   # Should print "docpilot: server skeleton — no tools registered yet"
   # and wait on stdin.
   ```

3. If you see no output, your shell or PATH is the problem (see Windows fix above).

## Windsurf "all MCP servers stop loading"

Older versions of Windsurf had a refresh-loop bug when one MCP server changed. docpilot does not share state across server instances and does not use SSE — confirmed working with Windsurf ≥ 1.4. If you hit this, restart Windsurf with all but docpilot disabled to isolate.

## File reported as too large to fetch

Files over 200 KB return a `peek` instead of full content unless you ask for a slice:

```text
fetch_doc("vercel/next.js", "very-long-doc.mdx", { lines: [1, 200] })
fetch_doc("vercel/next.js", "very-long-doc.mdx", { head_bytes: 8192 })
```

This is a token-budget guardrail, not a hard limit.

## Still stuck?

Open an issue at <https://github.com/tamimbinhakim/docpilot/issues> with:

1. `npx -y docpilot doctor` output (redact your token)
2. Your MCP client + version
3. The exact failing tool call
