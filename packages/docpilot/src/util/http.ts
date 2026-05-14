// Thin undici wrapper: UA, retry/backoff with Retry-After, per-request timeout, json helper.
import { type Dispatcher, request } from "undici";
import { sleep } from "./promise.js";

export type HttpResponse = {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: Buffer;
};

export type HttpRequestInit = {
  readonly method?: "GET" | "POST" | "HEAD";
  readonly headers?: Record<string, string>;
  readonly body?: string | Buffer | Uint8Array;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
};

export type HttpClientOptions = {
  readonly userAgent?: string;
  readonly defaultTimeoutMs?: number;
};

export class HttpClient {
  private readonly userAgent: string;
  private readonly defaultTimeoutMs: number;

  constructor(opts: HttpClientOptions = {}) {
    this.userAgent = opts.userAgent ?? `docpilot/${VERSION} (+https://github.com/tamimbinhakim/docpilot)`;
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 15_000;
  }

  async fetch(url: string, init: HttpRequestInit = {}): Promise<HttpResponse> {
    const method = init.method ?? "GET";
    const timeoutMs = init.timeoutMs ?? this.defaultTimeoutMs;
    const maxRetries = init.maxRetries ?? 3;

    const headers: Record<string, string> = {
      "user-agent": this.userAgent,
      accept: "*/*",
      ...lowercaseHeaders(init.headers),
    };

    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= maxRetries) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const reqInit: Parameters<typeof request>[1] = {
          method,
          headers,
          signal: controller.signal,
        };
        if (init.body !== undefined) {
          (reqInit as { body: Dispatcher.DispatchOptions["body"] }).body = init.body as never;
        }
        const res = await request(url, reqInit);
        const buf = Buffer.from(await res.body.arrayBuffer());
        const respHeaders = flattenHeaders(res.headers);

        if ((res.statusCode === 429 || res.statusCode >= 500) && attempt < maxRetries) {
          const retryAfter = parseRetryAfter(respHeaders["retry-after"]);
          await sleep(retryAfter ?? backoffMs(attempt));
          attempt += 1;
          continue;
        }

        return { status: res.statusCode, headers: respHeaders, body: buf };
      } catch (err) {
        lastErr = err;
        if (attempt >= maxRetries) break;
        await sleep(backoffMs(attempt));
        attempt += 1;
      } finally {
        clearTimeout(t);
      }
    }
    throw new Error(`http request failed: ${url}: ${String(lastErr)}`);
  }

  async json<T>(
    url: string,
    init: HttpRequestInit = {},
  ): Promise<{
    status: number;
    data: T | null;
    headers: Record<string, string>;
  }> {
    const res = await this.fetch(url, {
      ...init,
      headers: { accept: "application/json", ...init.headers },
    });
    if (res.status === 404 || res.body.length === 0)
      return { status: res.status, data: null, headers: res.headers };
    const text = res.body.toString("utf8");
    try {
      return {
        status: res.status,
        data: JSON.parse(text) as T,
        headers: res.headers,
      };
    } catch {
      return { status: res.status, data: null, headers: res.headers };
    }
  }
}

function flattenHeaders(h: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
  }
  return out;
}

function lowercaseHeaders(h: Record<string, string> | undefined): Record<string, string> {
  if (!h) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = v;
  return out;
}

function parseRetryAfter(value: string | undefined): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function backoffMs(attempt: number): number {
  return Math.min(8000, 250 * 2 ** attempt);
}

export const VERSION = "0.1.0";
