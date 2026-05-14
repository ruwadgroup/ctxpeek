import { HttpClient } from "../../util/index.js";
import { defineRegistry } from "../defineRegistry.js";
import { extractGithub } from "../extractGithub.js";

type NpmManifest = {
  repository?: { url?: string } | string;
  homepage?: string;
  bugs?: { url?: string } | string;
};

export default defineRegistry({
  id: "npm",
  displayName: "npm",
  probe: async (name, http = new HttpClient(), timeoutMs) => {
    const slug = encodeURIComponent(name).replace(/^%40/, "@").replace(/%2F/g, "/");
    const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
    if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
    const res = await http.json<NpmManifest>(`https://registry.npmjs.org/${slug}`, init);
    if (res.status === 404 || !res.data) return null;
    const repoUrl = typeof res.data.repository === "string" ? res.data.repository : res.data.repository?.url;
    const bugs = typeof res.data.bugs === "string" ? res.data.bugs : res.data.bugs?.url;
    return extractGithub(repoUrl) ?? extractGithub(res.data.homepage) ?? extractGithub(bugs);
  },
});
