// jsDelivr GitHub CDN.
import { CdnUnavailableError, NotFoundError } from "../core/index.js";
import { HttpClient } from "../util/index.js";

export const JSDELIVR_BASE = "https://cdn.jsdelivr.net/gh";
export const JSDELIVR_DATA_BASE = "https://data.jsdelivr.com/v1/package/gh";
export const JSDELIVR_MAX_FILE_BYTES = 50 * 1024 * 1024;

export type JsDelivrFlatEntry = {
  readonly name: string;
  readonly hash: string;
  readonly size: number;
  readonly time?: string;
};

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

  /**
   * Flat tree listing for a commit-pinned GitHub repo. Free, no GitHub REST
   * budget cost. The /flat endpoint returns every blob path under the
   * commit; we don't get sub-tree shas back, but `getTreeCached` only
   * stores type, path, and size — all of which the flat listing provides.
   *
   * Throws CdnUnavailableError if jsDelivr can't serve the listing (it
   * sometimes 404s on very fresh commits or commits with binary-only
   * contents). Callers should fall back to REST getTree.
   */
  async fetchFlatTree(
    owner: string,
    repo: string,
    commitSha: string,
  ): Promise<ReadonlyArray<JsDelivrFlatEntry>> {
    const url = `${JSDELIVR_DATA_BASE}/${owner}/${repo}@${commitSha}/flat`;
    const res = await this.http.fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (res.status === 404) throw new NotFoundError(`${url} (CDN flat)`);
    if (res.status < 200 || res.status >= 300) throw new CdnUnavailableError(url);
    let data: { files?: ReadonlyArray<{ name: string; hash?: string; size?: number; time?: string }> };
    try {
      data = JSON.parse(res.body.toString("utf8")) as typeof data;
    } catch {
      throw new CdnUnavailableError(`${url} (malformed JSON)`);
    }
    if (!data.files) throw new CdnUnavailableError(`${url} (no files field)`);
    return data.files.map((f) => {
      const out: JsDelivrFlatEntry = {
        name: f.name.replace(/^\/+/, ""),
        hash: f.hash ?? "",
        size: f.size ?? 0,
        ...(f.time ? { time: f.time } : {}),
      };
      return out;
    });
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
