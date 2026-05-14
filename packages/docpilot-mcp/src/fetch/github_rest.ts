/**
 * GitHub REST client. Uses undici for HTTP/2 + connection pooling.
 *
 * Endpoints used:
 *   GET /repos/{o}/{r}/contents/{path}       (with If-None-Match)
 *   GET /repos/{o}/{r}/git/trees/{sha}?recursive=1
 *   GET /repos/{o}/{r}/git/blobs/{sha}
 *   GET /repos/{o}/{r}/commits/{sha}         (resolve short ref)
 *   GET /repos/{o}/{r}/git/ref/...           (resolve symbolic ref)
 *
 * Authenticated 304s are FREE per docs.github.com — see §4.1.
 */
export interface RestClientOptions {
  readonly token: string | undefined;
  readonly userAgent: string;
}

export class GithubRestClient {
  constructor(private readonly _opts: RestClientOptions) {}
  // TODO(v0.1, day-2): conditional GET, tree, blob, ref resolution
}
