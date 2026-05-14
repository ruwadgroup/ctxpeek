import { HttpClient } from "../../util/index.js";
import { defineRegistry } from "../defineRegistry.js";
import { extractGithub } from "../extractGithub.js";

type RubygemsManifest = {
  source_code_uri?: string;
  homepage_uri?: string;
  bug_tracker_uri?: string;
};

export default defineRegistry({
  id: "rubygems",
  displayName: "RubyGems",
  probe: async (name, http = new HttpClient(), timeoutMs) => {
    const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
    if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
    const res = await http.json<RubygemsManifest>(
      `https://rubygems.org/api/v1/gems/${encodeURIComponent(name)}.json`,
      init,
    );
    if (res.status === 404 || !res.data) return null;
    return (
      extractGithub(res.data.source_code_uri) ??
      extractGithub(res.data.homepage_uri) ??
      extractGithub(res.data.bug_tracker_uri)
    );
  },
});
