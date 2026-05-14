import { HttpClient } from "../../util/index.js";
import { defineRegistry } from "../defineRegistry.js";
import { extractGithub } from "../extractGithub.js";

type PyPiManifest = {
  info?: {
    home_page?: string;
    project_urls?: Record<string, string>;
  };
};

const PRIORITY_KEYS = [
  "Source",
  "Source Code",
  "Repository",
  "Homepage",
  "Bug Tracker",
  "GitHub",
  "Code",
] as const;

export default defineRegistry({
  id: "pypi",
  displayName: "PyPI",
  probe: async (name, http = new HttpClient(), timeoutMs) => {
    const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
    if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
    const res = await http.json<PyPiManifest>(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, init);
    if (res.status === 404 || !res.data?.info) return null;
    const urls = res.data.info.project_urls ?? {};
    for (const k of PRIORITY_KEYS) {
      const got = extractGithub(urls[k]);
      if (got) return got;
    }
    for (const v of Object.values(urls)) {
      const got = extractGithub(v);
      if (got) return got;
    }
    return extractGithub(res.data.info.home_page);
  },
});
