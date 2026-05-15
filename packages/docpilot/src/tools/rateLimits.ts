import { z } from "zod";
import type { RateLimitSnapshot } from "../fetch/ratelimit.js";
import type { ToolContext } from "./context.js";

export const rateLimitsInput = z.object({
  live: z.boolean().optional(),
});

export type RateLimitsInput = z.infer<typeof rateLimitsInput>;

type GitHubLimitResource = {
  readonly limit: number;
  readonly used: number;
  readonly remaining: number;
  readonly reset: number;
};

type GitHubRateLimitResponse = {
  readonly resources?: Partial<Record<"core" | "search" | "graphql", GitHubLimitResource>>;
};

export function buildRateLimitsTool(ctx: ToolContext) {
  return async (input: RateLimitsInput): Promise<string> => {
    const live = input.live ?? true;
    const lines: string[] = [];
    lines.push("# Rate limits");
    lines.push("");

    if (live) {
      lines.push(...(await renderLiveGithubLimits(ctx)));
      lines.push("");
      lines.push(...renderLocalSnapshot(ctx.limiter.snapshot(), { includePrimary: false }));
    } else {
      lines.push(...renderLocalSnapshot(ctx.limiter.snapshot(), { includePrimary: true }));
      lines.push("");
      lines.push(
        "Live GitHub check skipped. Primary values above are only the last response headers docpilot observed.",
      );
    }

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

async function renderLiveGithubLimits(ctx: ToolContext): Promise<string[]> {
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
      timeoutMs: 6000,
    });
    ctx.limiter.observe(res.headers);
    if (res.status !== 200) {
      return ["## GitHub API (live)", "", `GitHub returned HTTP ${res.status}.`];
    }
    const data = JSON.parse(res.body.toString("utf8")) as GitHubRateLimitResponse;
    const lines = ["## GitHub API (live)", ""];
    for (const name of ["core", "search", "graphql"] as const) {
      const resource = data.resources?.[name];
      if (!resource) continue;
      lines.push(
        `${name}: ${resource.remaining}/${resource.limit} remaining, used ${resource.used}, reset ${formatReset(resource.reset)}`,
      );
    }
    return lines;
  } catch (err) {
    return ["## GitHub API (live)", "", `Check failed: ${String(err)}`];
  } finally {
    ctx.limiter.release();
  }
}

function formatReset(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}
