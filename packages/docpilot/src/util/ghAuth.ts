// Token discovery via the `gh` CLI. Reuses the existing `gh auth login`
// session if present so users who already authed gh don't need a second PAT.
import { execFileSync } from "node:child_process";

export type GhTokenSource = {
  readonly token: string;
  readonly account: string | undefined;
};

/**
 * Try to read a token from the `gh` CLI for `hostname` (default: github.com).
 * Returns `null` if `gh` isn't installed, isn't authed for that host, or
 * the call fails for any reason. Never throws.
 */
export function readGhToken(hostname = "github.com"): GhTokenSource | null {
  let token: string | null = null;
  try {
    token = execFileSync("gh", ["auth", "token", "--hostname", hostname], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: 4000,
    }).trim();
  } catch {
    return null;
  }
  if (!token) return null;
  return { token, account: readActiveAccount(hostname) };
}

function readActiveAccount(hostname: string): string | undefined {
  try {
    const out = execFileSync("gh", ["auth", "status", "--hostname", hostname, "--active"], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: 4000,
    });
    const m = /account\s+(\S+)/i.exec(out);
    return m?.[1];
  } catch {
    return undefined;
  }
}

/** Check whether the `gh` binary is available on PATH. */
export function ghAvailable(): boolean {
  try {
    execFileSync("gh", ["--version"], { stdio: "ignore", timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}
