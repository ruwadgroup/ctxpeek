import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";
import { CtxpeekError, RateLimitError } from "../core/index.js";

type StructuredToolError = {
  readonly ok: false;
  readonly tool: string;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly name?: string;
    readonly reset_at?: string;
    readonly details?: ReadonlyArray<string>;
    readonly retryable: boolean;
    readonly suggestions: ReadonlyArray<string>;
  };
};

type NormalizedToolError = {
  readonly code: string;
  readonly message: string;
  readonly name: string | undefined;
  readonly resetAt: string | undefined;
  readonly details: ReadonlyArray<string>;
  readonly retryable: boolean;
  readonly suggestions: ReadonlyArray<string>;
};

/**
 * Return tool failures as normal markdown content so MCP clients that hide
 * `isError` payloads still give the model enough information to recover.
 */
export function toolErrorResult(toolName: string, err: unknown): CallToolResult {
  const normalized = normalizeToolError(toolName, err);
  const structured: StructuredToolError = {
    ok: false,
    tool: toolName,
    error: {
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      suggestions: normalized.suggestions,
      ...(normalized.name ? { name: normalized.name } : {}),
      ...(normalized.resetAt ? { reset_at: normalized.resetAt } : {}),
      ...(normalized.details.length > 0 ? { details: normalized.details } : {}),
    },
  };

  return {
    content: [{ type: "text", text: renderToolError(toolName, normalized) }],
    structuredContent: structured as unknown as Record<string, unknown>,
  };
}

// zod v4 renders a missing required field as "Invalid input: expected <type>,
// received undefined". Keep the concise "Required" wording the agent-facing
// error contract has always used for that case.
function issueMessage(issue: ZodError["issues"][number]): string {
  if (issue.code === "invalid_type" && /received undefined$/.test(issue.message)) {
    return "Required";
  }
  return issue.message;
}

function normalizeToolError(toolName: string, err: unknown): NormalizedToolError {
  if (err instanceof ZodError) {
    return {
      code: "invalid_input",
      message: "Tool input did not match the expected schema.",
      name: err.name,
      resetAt: undefined,
      details: err.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
        return `${path}: ${issueMessage(issue)}`;
      }),
      retryable: true,
      suggestions: ["Fix the tool arguments and retry."],
    };
  }

  if (err instanceof CtxpeekError) {
    const resetAt = err instanceof RateLimitError ? err.resetAt?.toISOString() : undefined;
    return {
      code: err.code,
      message: err.message,
      name: err.name,
      resetAt,
      details: [],
      retryable: retryableCode(err.code),
      suggestions: suggestionsFor(toolName, err.code, resetAt),
    };
  }

  if (err instanceof Error) {
    return {
      code: "unexpected_error",
      message: err.message,
      name: err.name,
      resetAt: undefined,
      details: [],
      retryable: false,
      suggestions: suggestionsFor(toolName, "unexpected_error"),
    };
  }

  return {
    code: "unexpected_error",
    message: String(err),
    name: undefined,
    resetAt: undefined,
    details: [],
    retryable: false,
    suggestions: suggestionsFor(toolName, "unexpected_error"),
  };
}

function renderToolError(toolName: string, err: NormalizedToolError): string {
  const lines = [`# ${toolName} could not complete`, "", `code: ${err.code}`, `message: ${err.message}`];
  if (err.resetAt) lines.push(`reset_at: ${err.resetAt}`);
  if (err.details.length > 0) {
    lines.push("", "Details:");
    for (const detail of err.details) lines.push(`- ${detail}`);
  }
  if (err.suggestions.length > 0) {
    lines.push("", "Next steps:");
    for (const suggestion of err.suggestions) lines.push(`- ${suggestion}`);
  }
  return lines.join("\n");
}

function retryableCode(code: string): boolean {
  return code === "rate_limit" || code === "cdn_unavailable";
}

function suggestionsFor(toolName: string, code: string, resetAt?: string): ReadonlyArray<string> {
  switch (code) {
    case "rate_limit":
      return [
        resetAt
          ? `Wait until ${resetAt}, then retry.`
          : "Wait for the GitHub rate limit to reset, then retry.",
        "Call `rate_limits` to inspect the current GitHub and local throttler state.",
        "Configure `GITHUB_TOKEN` for a higher GitHub API budget.",
      ];
    case "not_found":
      return [
        "Verify the repo, ref, and subpath.",
        "If this came from `resolve_repo`, retry with the returned `repo_spec` exactly.",
      ];
    case "invalid_repo_spec":
      return ["Use `[forge:]owner/repo[@ref][#subpath]`, for example `vercel/ai#packages/ai`."];
    case "cache_corrupt":
      return ["Run `ctxpeek cache gc` or clear the affected cache entry, then retry."];
    case "cdn_unavailable":
      return ["Retry the same tool call; ctxpeek will fall back to forge APIs when possible."];
    case "unexpected_error":
      return [`Retry ${toolName}; if it repeats, report this message with the tool arguments.`];
    default:
      return ["Adjust the request based on the error message and retry."];
  }
}
