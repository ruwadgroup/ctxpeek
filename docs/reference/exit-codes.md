# Exit codes

The `docpilot` CLI follows standard POSIX exit-code conventions.

| Code | Meaning                                                         |
| ---- | --------------------------------------------------------------- |
| `0`  | Success                                                         |
| `1`  | Generic failure (unhandled error, panic)                        |
| `2`  | Usage error (unknown subcommand, invalid flag)                  |
| `64` | Bad input (malformed `.docpilot.toml`, malformed recipe)        |
| `65` | Configuration error (cache dir not writable, conflicting flags) |
| `66` | Resource not found (repo, path, recipe URL 404)                 |
| `69` | Service unavailable (GitHub down, all CDNs failed)              |
| `70` | Internal error (cache corruption, index corruption)             |
| `74` | I/O error (disk full, permission denied)                        |
| `75` | Temporary failure (rate-limited; retry recommended)             |
| `77` | Permission denied (insufficient PAT scope)                      |
| `78` | Configuration error (token discovery exhausted; no auth)        |

The MCP server (`docpilot`) exits `0` on a clean shutdown via SIGTERM/SIGINT, and `1` on an unhandled exception. It never exits `0` while the stdio transport is still attached.
