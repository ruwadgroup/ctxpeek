/**
 * Typed error hierarchy. Tools convert these to MCP `isError: true` results
 * with a markdown body explaining the failure (see §6 of the design doc).
 */

export class DocpilotError extends Error {
  readonly code: string;
  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DocpilotError";
    this.code = code;
  }
}

export class InvalidRepoSpecError extends DocpilotError {
  constructor(input: string, reason: string) {
    super("invalid_repo_spec", `Invalid repo spec "${input}": ${reason}`);
    this.name = "InvalidRepoSpecError";
  }
}

export class NotFoundError extends DocpilotError {
  constructor(what: string) {
    super("not_found", `${what} not found`);
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends DocpilotError {
  readonly resetAt: Date | undefined;
  constructor(message: string, resetAt?: Date) {
    super("rate_limit", message);
    this.name = "RateLimitError";
    this.resetAt = resetAt;
  }
}

export class CdnUnavailableError extends DocpilotError {
  constructor(url: string, cause?: unknown) {
    super("cdn_unavailable", `CDN fetch failed for ${url}`, { cause });
    this.name = "CdnUnavailableError";
  }
}

export class CacheCorruptError extends DocpilotError {
  constructor(path: string) {
    super("cache_corrupt", `Cache entry at ${path} failed integrity check`);
    this.name = "CacheCorruptError";
  }
}
