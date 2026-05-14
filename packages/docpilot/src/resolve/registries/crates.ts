import { HttpClient } from "../../util/index.js";
import { defineRegistry } from "../defineRegistry.js";
import { extractGithub } from "../extractGithub.js";

type CratesManifest = {
  crate?: { repository?: string; homepage?: string };
};

export default defineRegistry({
  id: "crates",
  displayName: "crates.io",
  probe: async (name, http = new HttpClient(), timeoutMs) => {
    const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
    if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
    const res = await http.json<CratesManifest>(
      `https://crates.io/api/v1/crates/${encodeURIComponent(name)}`,
      init,
    );
    if (res.status === 404 || !res.data?.crate) return null;
    return extractGithub(res.data.crate.repository) ?? extractGithub(res.data.crate.homepage);
  },
});
