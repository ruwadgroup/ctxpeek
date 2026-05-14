import { HttpClient } from "../../util/index.js";
import { defineRegistry } from "../defineRegistry.js";
import { extractGithub } from "../extractGithub.js";

// pkg.go.dev: when the module path is already `github.com/o/r[/...]`,
// short-circuit. Otherwise scrape the "Repository" anchor from the HTML.
export default defineRegistry({
  id: "go",
  displayName: "pkg.go.dev",
  probe: async (name, http = new HttpClient(), timeoutMs) => {
    const direct = extractGithub(name.startsWith("github.com/") ? name : null);
    if (direct) return direct;
    try {
      const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
      if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
      const res = await http.fetch(`https://pkg.go.dev/${encodeURIComponent(name)}`, init);
      if (res.status !== 200) return null;
      const m = /href="(https?:\/\/github\.com\/[^"]+)"/i.exec(res.body.toString("utf8"));
      return m ? extractGithub(m[1] ?? "") : null;
    } catch {
      return null;
    }
  },
});
