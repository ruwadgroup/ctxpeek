// jsDelivr GitHub CDN.
import { CdnUnavailableError, NotFoundError } from "@docpilot/core";
import { HttpClient } from "../util/index.js";

export const JSDELIVR_BASE = "https://cdn.jsdelivr.net/gh";
export const JSDELIVR_MAX_FILE_BYTES = 50 * 1024 * 1024;

export function jsDelivrUrl(owner: string, repo: string, commitSha: string, filePath: string): string {
  return `${JSDELIVR_BASE}/${owner}/${repo}@${commitSha}/${filePath.replace(/^\/+/, "")}`;
}

export type JsDelivrFile = {
  readonly type: "file";
  readonly name: string;
  readonly hash: string;
  readonly time: string;
  readonly size: number;
};

export type JsDelivrDir = {
  readonly type: "directory";
  readonly name: string;
  readonly files: ReadonlyArray<JsDelivrFile | JsDelivrDir>;
};

export class JsDelivrClient {
  constructor(private readonly http: HttpClient = new HttpClient()) {}

  async fetchFile(owner: string, repo: string, commitSha: string, filePath: string): Promise<Uint8Array> {
    const url = jsDelivrUrl(owner, repo, commitSha, filePath);
    return this.fetchByUrl(url);
  }

  async fetchByUrl(url: string): Promise<Uint8Array> {
    const res = await this.http.fetch(url, { method: "GET" });
    if (res.status === 404) throw new NotFoundError(`${url} (CDN)`);
    if (res.status < 200 || res.status >= 300) throw new CdnUnavailableError(url);
    if (res.body.length > JSDELIVR_MAX_FILE_BYTES)
      throw new CdnUnavailableError(`${url} (exceeds 50 MB jsDelivr cap)`);
    return new Uint8Array(res.body);
  }

  async headHealthcheck(): Promise<boolean> {
    try {
      const res = await this.http.fetch(`${JSDELIVR_BASE}/jsdelivr/jsdelivr@master/README.md`, {
        method: "HEAD",
        maxRetries: 0,
        timeoutMs: 4000,
      });
      return res.status < 500;
    } catch {
      return false;
    }
  }
}
