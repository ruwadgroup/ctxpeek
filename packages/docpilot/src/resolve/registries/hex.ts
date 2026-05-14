import { HttpClient } from "../../util/index.js";
import { defineRegistry } from "../defineRegistry.js";
import { extractGithub } from "../extractGithub.js";

type HexManifest = {
  meta?: { links?: Record<string, string> };
  html_url?: string;
};

export default defineRegistry({
  id: "hex",
  displayName: "Hex.pm",
  probe: async (name, http = new HttpClient(), timeoutMs) => {
    const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
    if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
    const res = await http.json<HexManifest>(`https://hex.pm/api/packages/${encodeURIComponent(name)}`, init);
    if (res.status === 404 || !res.data) return null;
    for (const v of Object.values(res.data.meta?.links ?? {})) {
      const got = extractGithub(v);
      if (got) return got;
    }
    return extractGithub(res.data.html_url);
  },
});
