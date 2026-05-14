/**
 * GitHub forge plug-in. Wraps the existing `GithubRestClient` (which handles
 * conditional GETs, rate-limit observation, etc.) and adapts it to the
 * generic `ForgeClient` shape.
 */
import { defineForge } from "../defineForge.js";
import type { ForgeClient } from "../forgeClient.js";
import { GithubRestClient } from "../githubRest.js";

export default defineForge({
  id: "github",
  displayName: "GitHub",
  aliases: ["gh"],
  tokenEnv: "GITHUB_TOKEN",
  create: (ctx) => {
    const rest = new GithubRestClient({
      token: ctx.token,
      userAgent: ctx.userAgent,
      limiter: ctx.limiter,
      http: ctx.http,
    });
    const client: ForgeClient = {
      forge: "github",
      hasToken: () => rest.hasToken(),
      getRepo: (o, r) => rest.getRepo(o, r),
      resolveRef: (o, r, ref) => rest.resolveRef(o, r, ref),
      getTree: (o, r, sha, recursive) => rest.getTree(o, r, sha, recursive),
      getContents: (o, r, p, ref, etag) => rest.getContents(o, r, p, ref, etag),
      getLastCommitForPath: (o, r, ref, p) => rest.getLastCommitForPath(o, r, ref, p),
      searchRepositories: (q, n) => rest.searchRepositories(q, n),
      searchIssues: (o, r, q, opts) => rest.searchIssues(o, r, q, opts),
      cdnUrl: (o, r, sha, p) => `https://cdn.jsdelivr.net/gh/${o}/${r}@${sha}/${p.replace(/^\/+/, "")}`,
    };
    return client;
  },
});
