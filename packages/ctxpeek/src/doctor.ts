// `ctxpeek doctor` — environment self-check.

import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadConfig } from "./config.js";
import { GithubRestClient } from "./fetch/githubRest.js";
import { JsDelivrClient } from "./fetch/jsdelivr.js";
import { HttpClient } from "./util/index.js";

export type CheckStatus = "ok" | "warn" | "fail";

export type DoctorCheck = {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail?: string;
};

export type DoctorReport = {
  readonly ok: boolean;
  readonly checks: ReadonlyArray<DoctorCheck>;
  readonly recommendation: string | null;
};

export async function runDoctor(argv: ReadonlyArray<string> = []): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const isWindows = process.platform === "win32";
  const config = await loadConfig(argv).catch((err) => {
    checks.push({ name: "config", status: "fail", detail: String(err) });
    return null;
  });

  checks.push(checkNode());
  const npxCheck = checkNpxLocatable();
  checks.push(npxCheck);

  if (config) {
    checks.push(await checkCacheDir(config.paths.cache));
    checks.push(await checkTokenScope(config.auth.token, config.auth.tokenSource, config.auth.ghAccount));
    checks.push(...(await checkForgeTokens()));
    checks.push(await checkGithubReachable(config.auth.token));
    if (config.fetch.cdnEnabled) checks.push(await checkCdnReachable());
  }

  const ok = checks.every((c) => c.status !== "fail");
  let recommendation: string | null = null;
  if (isWindows) {
    recommendation =
      "On Windows, configure your MCP client to spawn ctxpeek via cmd /c — paste:\n" +
      JSON.stringify({ command: "cmd", args: ["/c", "npx", "-y", "ctxpeek"] }, null, 2);
  }

  return { ok, checks, recommendation };
}

function checkNode(): DoctorCheck {
  const version = process.versions.node;
  const major = Number(version.split(".")[0]);
  if (major < 20) return { name: "Node.js", status: "fail", detail: `${version} (need ≥ 20)` };
  return { name: "Node.js", status: "ok", detail: version };
}

function checkNpxLocatable(): DoctorCheck {
  try {
    const which = process.platform === "win32" ? "where npx" : "command -v npx";
    const out = execSync(which, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    if (!out)
      return {
        name: "npx on PATH",
        status: "warn",
        detail: "not resolvable from a non-shell-spawn context",
      };
    return {
      name: "npx on PATH",
      status: "ok",
      detail: out.split(/\r?\n/)[0] ?? "",
    };
  } catch {
    return { name: "npx on PATH", status: "warn", detail: "not resolvable" };
  }
}

async function checkCacheDir(cacheDir: string): Promise<DoctorCheck> {
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    const probe = path.join(cacheDir, ".doctor-probe");
    await fs.writeFile(probe, `${Date.now()}`);
    await fs.unlink(probe);
    return { name: "Cache dir writable", status: "ok", detail: cacheDir };
  } catch (err) {
    return { name: "Cache dir writable", status: "fail", detail: String(err) };
  }
}

async function checkTokenScope(
  token: string | undefined,
  source: "cli" | "env" | "gh" | "none",
  ghAccount: string | undefined,
): Promise<DoctorCheck> {
  const name = "GitHub token";
  if (!token) {
    return {
      name,
      status: "warn",
      detail: "no token found — anonymous mode (60 req/hr REST). Run `gh auth login` or set GITHUB_TOKEN.",
    };
  }
  const sourceLabel =
    source === "cli"
      ? "from --token"
      : source === "env"
        ? "from $GITHUB_TOKEN"
        : source === "gh"
          ? `from \`gh auth token\`${ghAccount ? ` (account: ${ghAccount})` : ""}`
          : "unknown source";
  const http = new HttpClient();
  try {
    const res = await http.fetch("https://api.github.com/user", {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
      },
      maxRetries: 0,
      timeoutMs: 6000,
    });
    if (res.status === 401)
      return {
        name,
        status: "fail",
        detail: `${sourceLabel} — rejected by GitHub (401)`,
      };
    if (res.status === 403)
      return {
        name,
        status: "warn",
        detail: `${sourceLabel} — 403 on /user`,
      };
    if (res.status !== 200)
      return {
        name,
        status: "warn",
        detail: `${sourceLabel} — unexpected ${res.status}`,
      };
    const login = (JSON.parse(res.body.toString("utf8")) as { login?: string }).login ?? "anon";
    const scopes = res.headers["x-oauth-scopes"] ?? "(fine-grained PAT)";
    const privateRepoNote = scopes.includes("repo") ? " — private repos accessible" : " — public repos only";
    return {
      name,
      status: "ok",
      detail: `${sourceLabel} — login=${login}, scopes=${scopes}${privateRepoNote}`,
    };
  } catch (err) {
    return {
      name,
      status: "warn",
      detail: `${sourceLabel} — check failed: ${String(err)}`,
    };
  }
}

async function checkForgeTokens(): Promise<DoctorCheck[]> {
  const out: DoctorCheck[] = [];
  if (process.env.GITLAB_TOKEN) {
    const http = new HttpClient();
    try {
      const res = await http.fetch("https://gitlab.com/api/v4/user", {
        headers: { "private-token": process.env.GITLAB_TOKEN ?? "" },
        maxRetries: 0,
        timeoutMs: 6000,
      });
      if (res.status === 200) {
        out.push({
          name: "GITLAB_TOKEN",
          status: "ok",
          detail: "valid — private GitLab repos accessible",
        });
      } else {
        out.push({
          name: "GITLAB_TOKEN",
          status: "warn",
          detail: `unexpected ${res.status}`,
        });
      }
    } catch (err) {
      out.push({
        name: "GITLAB_TOKEN",
        status: "warn",
        detail: `check failed: ${String(err)}`,
      });
    }
  }
  if (process.env.BITBUCKET_TOKEN) {
    out.push({
      name: "BITBUCKET_TOKEN",
      status: "ok",
      detail: "set — private Bitbucket repos may be accessible",
    });
  }
  return out;
}

async function checkGithubReachable(token: string | undefined): Promise<DoctorCheck> {
  const rest = new GithubRestClient({ token, userAgent: "ctxpeek-doctor" });
  try {
    await rest.getRepo("github", "docs");
    return { name: "api.github.com reachable", status: "ok" };
  } catch (err) {
    return {
      name: "api.github.com reachable",
      status: "warn",
      detail: String(err),
    };
  }
}

async function checkCdnReachable(): Promise<DoctorCheck> {
  const cdn = new JsDelivrClient();
  const ok = await cdn.headHealthcheck();
  return { name: "cdn.jsdelivr.net reachable", status: ok ? "ok" : "warn" };
}

export function renderDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`# ctxpeek doctor`);
  lines.push("");
  lines.push(`Platform: ${process.platform} ${os.release()} / Node ${process.versions.node}`);
  lines.push("");
  for (const c of report.checks) {
    const icon = c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "✗";
    const detail = c.detail ? `  — ${c.detail}` : "";
    lines.push(`${icon} ${c.name}${detail}`);
  }
  if (report.recommendation) {
    lines.push("");
    lines.push("Recommendation:");
    lines.push(report.recommendation);
  }
  lines.push("");
  lines.push(report.ok ? "Overall: ok" : "Overall: needs attention");
  return lines.join("\n");
}
