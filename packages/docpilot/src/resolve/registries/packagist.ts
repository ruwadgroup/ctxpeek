import { HttpClient } from "../../util/index.js";
import { defineRegistry } from "../defineRegistry.js";
import { extractGithub } from "../extractGithub.js";

type PackagistManifest = {
  packages?: Record<
    string,
    Array<{
      source?: { url?: string };
      homepage?: string;
    }>
  >;
};

export default defineRegistry({
  id: "packagist",
  displayName: "Packagist",
  probe: async (name, http = new HttpClient(), timeoutMs) => {
    if (!name.includes("/")) return null;
    const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
    if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
    const res = await http.json<PackagistManifest>(`https://repo.packagist.org/p2/${name}.json`, init);
    if (res.status === 404 || !res.data?.packages) return null;
    for (const versions of Object.values(res.data.packages)) {
      for (const v of versions ?? []) {
        const got = extractGithub(v.source?.url ?? v.homepage);
        if (got) return got;
      }
    }
    return null;
  },
});
