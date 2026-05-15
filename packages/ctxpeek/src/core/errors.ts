/**
 * Typed error hierarchy. Tools convert these to model-visible markdown
 * failures with structured metadata.
 */

export class CtxpeekError extends Error {
  readonly code: string;
  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CtxpeekError";
    this.code = code;
  }
}

export class InvalidRepoSpecError extends CtxpeekError {
  constructor(input: string, reason: string) {
    super("invalid_repo_spec", `Invalid repo spec "${input}": ${reason}`);
    this.name = "InvalidRepoSpecError";
  }
}

export class NotFoundError extends CtxpeekError {
  constructor(what: string) {
    super("not_found", `${what} not found`);
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends CtxpeekError {
  readonly resetAt: Date | undefined;
  constructor(message: string, resetAt?: Date) {
    super("rate_limit", message);
    this.name = "RateLimitError";
    this.resetAt = resetAt;
  }
}

export class CdnUnavailableError extends CtxpeekError {
  constructor(url: string, cause?: unknown) {
    super("cdn_unavailable", `CDN fetch failed for ${url}`, { cause });
    this.name = "CdnUnavailableError";
  }
}

export class CacheCorruptError extends CtxpeekError {
  constructor(path: string) {
    super("cache_corrupt", `Cache entry at ${path} failed integrity check`);
    this.name = "CacheCorruptError";
  }
}
