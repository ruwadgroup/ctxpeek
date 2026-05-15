import { HttpClient } from "../../util/index.js";
import { candidateFromUrl, defineRegistry } from "../defineRegistry.js";
import { extractRepo } from "../extractGithub.js";

// pkg.go.dev: when the module path is already `github.com/o/r[/...]`,
// short-circuit. Otherwise scrape the "Repository" anchor from the HTML.
export default defineRegistry({
  id: "go",
  displayName: "pkg.go.dev",
  probe: async (name, http = new HttpClient(), timeoutMs) => {
    const direct = extractRepo(name);
    if (direct) {
      return {
        ...direct,
        packageName: name,
        matchedUrl: name,
        urlField: "module",
        confidence: 0.98,
        registryUrl: `https://pkg.go.dev/${name}`,
      };
    }
    try {
      const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
      if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
      const registryUrl = `https://pkg.go.dev/${encodeURIComponent(name)}`;
      const res = await http.fetch(registryUrl, init);
      if (res.status !== 200) return null;
      const m = /href="([^"]*(?:github\.com|gitlab\.com|bitbucket\.org)[^"]+)"/i.exec(
        res.body.toString("utf8"),
      );
      return candidateFromUrl({
        packageName: name,
        url: m?.[1],
        urlField: "repository",
        confidence: 0.86,
        registryUrl,
      });
    } catch {
      return null;
    }
  },
});
