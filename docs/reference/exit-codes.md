# Exit codes

The current CLI returns a small set of stable process exit codes.

| Code | Meaning                                                     |
| ---- | ----------------------------------------------------------- |
| `0`  | Success                                                     |
| `1`  | Runtime failure or a command that completed with failures   |
| `2`  | Usage error (unknown subcommand, missing required argument) |

The MCP server (`ctxpeek` with no subcommand) returns `0` after the stdio transport closes cleanly and `1` on an unhandled exception.
