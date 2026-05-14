#!/usr/bin/env node
/**
 * `docpilot` binary — companion CLI for the MCP server.
 *
 * Subcommands (planned):
 *   docpilot doctor                 self-check, see src/doctor/
 *   docpilot recipe install <path>  pre-warm cache from a recipe file
 *   docpilot cache status [repo]    print cache stats
 *   docpilot cache gc               run GC against the configured cap
 */
async function main(argv: ReadonlyArray<string>): Promise<number> {
  const [, , command] = argv;
  switch (command) {
    case "doctor":
      // TODO(v0.1): import and run src/doctor/run.ts
      process.stdout.write("docpilot doctor: not implemented yet\n");
      return 0;
    case "recipe":
      process.stdout.write("docpilot recipe: not implemented yet\n");
      return 0;
    case "cache":
      process.stdout.write("docpilot cache: not implemented yet\n");
      return 0;
    case "--version":
    case "-v":
      // Version is wired up at build time from package.json.
      process.stdout.write("docpilot 0.0.0\n");
      return 0;
    case "--help":
    case "-h":
    case undefined:
      process.stdout.write(usage);
      return 0;
    default:
      process.stderr.write(`unknown command: ${command}\n${usage}`);
      return 1;
  }
}

const usage = `docpilot — local-first MCP server for GitHub-hosted docs

Usage:
  docpilot doctor                 Run environment self-check
  docpilot recipe install <path>  Pre-warm cache from a recipe
  docpilot cache status [repo]    Print cache stats
  docpilot cache gc               Run garbage collection

The MCP server itself is launched via \`docpilot-mcp\` (typically by your
MCP client through \`npx -y docpilot-mcp\`).
`;

main(process.argv).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`docpilot: fatal: ${String(err)}\n`);
    process.exit(1);
  },
);
