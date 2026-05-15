import { HttpClient } from "../../util/index.js";
import { candidateFromUrl, defineRegistry, type RegistryCandidate } from "../defineRegistry.js";

type RubygemsManifest = {
  name?: string;
  source_code_uri?: string;
  homepage_uri?: string;
  bug_tracker_uri?: string;
  project_uri?: string;
};

export default defineRegistry({
  id: "rubygems",
  displayName: "RubyGems",
  probe: async (name, http = new HttpClient(), timeoutMs) => {
    const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
    if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
    const registryUrl = `https://rubygems.org/api/v1/gems/${encodeURIComponent(name)}.json`;
    const res = await http.json<RubygemsManifest>(registryUrl, init);
    if (res.status === 404 || !res.data) return null;
    return candidatesFromGem(res.data.name ?? name, registryUrl, res.data, 0.95, 0.76, 0.66);
  },
  search: async (query, http = new HttpClient(), timeoutMs) => {
    const url = `https://rubygems.org/api/v1/search.json?query=${encodeURIComponent(query)}`;
    const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
    if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
    const res = await http.json<ReadonlyArray<RubygemsManifest>>(url, init);
    if (res.status === 404 || !res.data) return [];
    return res.data
      .slice(0, 5)
      .flatMap((gem) =>
        candidatesFromGem(
          gem.name ?? query,
          gem.project_uri ?? (gem.name ? `https://rubygems.org/gems/${encodeURIComponent(gem.name)}` : url),
          gem,
          0.82,
          0.66,
          0.58,
        ),
      );
  },
});

function candidatesFromGem(
  packageName: string,
  registryUrl: string,
  gem: RubygemsManifest,
  sourceConfidence: number,
  homepageConfidence: number,
  bugsConfidence: number,
): ReadonlyArray<RegistryCandidate> {
  const out: RegistryCandidate[] = [];
  const source = candidateFromUrl({
    packageName,
    url: gem.source_code_uri,
    urlField: "source-code",
    confidence: sourceConfidence,
    registryUrl,
  });
  if (source) out.push(source);
  const homepage = candidateFromUrl({
    packageName,
    url: gem.homepage_uri,
    urlField: "homepage",
    confidence: homepageConfidence,
    registryUrl,
  });
  if (homepage) out.push(homepage);
  const bugs = candidateFromUrl({
    packageName,
    url: gem.bug_tracker_uri,
    urlField: "bugs",
    confidence: bugsConfidence,
    registryUrl,
  });
  if (bugs) out.push(bugs);
  return out;
}
