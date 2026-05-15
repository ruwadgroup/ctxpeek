import { z } from "zod";
import type { RateLimitSnapshot } from "../fetch/ratelimit.js";
import type { ToolContext } from "./context.js";

export const rateLimitsInput = z.object({});

export type RateLimitsInput = z.infer<typeof rateLimitsInput>;

const GITHUB_CHECK_FAILURE_COOLDOWN_MS = 60_000;
const GITHUB_CHECK_TIMEOUT_MS = 2500;

type GitHubLimitResource = {
  readonly limit: number;
  readonly used: number;
  readonly remaining: number;
  readonly reset: number;
};

type GitHubRateLimitResponse = {
  readonly resources?: Partial<Record<"core" | "search" | "graphql", GitHubLimitResource>>;
};

type GithubCheckResult =
  | { readonly ok: true; readonly lines: string[] }
  | { readonly ok: false; readonly lines: string[] };

export function buildRateLimitsTool(ctx: ToolContext) {
  let githubFailureRetryAt = 0;

  return async (_input: RateLimitsInput): Promise<string> => {
    const lines: string[] = [];
    lines.push("# Rate limits");
    lines.push("");

    const github = await renderGithubRateLimits(ctx, githubFailureRetryAt);
    let nextRetry: Date | undefined;
    if (github.ok) {
      githubFailureRetryAt = 0;
    } else if (githubFailureRetryAt <= Date.now()) {
      githubFailureRetryAt = Date.now() + GITHUB_CHECK_FAILURE_COOLDOWN_MS;
      nextRetry = new Date(githubFailureRetryAt);
    }

    lines.push(...github.lines);
    if (nextRetry) lines.push(`Next retry: ${nextRetry.toISOString()}.`);
    lines.push("");
    lines.push(...renderLocalSnapshot(ctx.limiter.snapshot(), { includePrimary: !github.ok }));

    return lines.join("\n");
  };
}

function renderLocalSnapshot(
  snapshot: RateLimitSnapshot,
  options: { readonly includePrimary: boolean },
): string[] {
  const reset = snapshot.resetAt ? snapshot.resetAt.toISOString() : "unknown";
  const observed = snapshot.observedAt ? snapshot.observedAt.toISOString() : "never";
  const lines = ["## Local throttler", ""];
  if (options.includePrimary) {
    lines.push(
      `Last GitHub primary: ${snapshot.remaining ?? "unknown"}`,
      `Observed at:         ${observed}`,
      `Primary reset:       ${reset}`,
    );
  }
  lines.push(
    `Mode:                ${snapshot.degraded ? "degraded" : "normal"}`,
    `Requests:            ${snapshot.inflight} running, ${snapshot.queued} queued`,
    `Secondary budget:    ${snapshot.secondaryBudgetPerMinute}/min (${snapshot.bucketTokens}/${snapshot.bucketCapacity} tokens available)`,
    `Concurrency:         ${snapshot.concurrentMax} max`,
  );
  return lines;
}

async function renderGithubRateLimits(ctx: ToolContext, retryAt: number): Promise<GithubCheckResult> {
  const now = Date.now();
  if (retryAt > now) {
    return {
      ok: false,
      lines: [
        "## GitHub API",
        "",
        `GitHub check delayed after the previous failure. Next retry: ${new Date(retryAt).toISOString()}.`,
      ],
    };
  }

  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  if (ctx.config.auth.token) headers.authorization = `Bearer ${ctx.config.auth.token}`;

  await ctx.limiter.acquire();
  try {
    const res = await ctx.http.fetch("https://api.github.com/rate_limit", {
      headers,
      maxRetries: 0,
      timeoutMs: GITHUB_CHECK_TIMEOUT_MS,
    });
    ctx.limiter.observe(res.headers);
    if (res.status !== 200) {
      return {
        ok: false,
        lines: ["## GitHub API", "", `GitHub returned HTTP ${res.status}. Using local state.`],
      };
    }
    const data = JSON.parse(res.body.toString("utf8")) as GitHubRateLimitResponse;
    const lines = ["## GitHub API", ""];
    for (const name of ["core", "search", "graphql"] as const) {
      const resource = data.resources?.[name];
      if (!resource) continue;
      lines.push(
        `${name}: ${resource.remaining}/${resource.limit} remaining, used ${resource.used}, reset ${formatReset(resource.reset)}`,
      );
    }
    return { ok: true, lines };
  } catch (err) {
    return {
      ok: false,
      lines: ["## GitHub API", "", `GitHub check unavailable: ${String(err)}. Using local state.`],
    };
  } finally {
    ctx.limiter.release();
  }
}

function formatReset(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}
