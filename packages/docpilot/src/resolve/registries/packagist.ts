import { HttpClient } from "../../util/index.js";
import { candidateFromUrl, defineRegistry, type RegistryCandidate } from "../defineRegistry.js";

type PackagistManifest = {
  packages?: Record<
    string,
    Array<{
      source?: { url?: string };
      homepage?: string;
    }>
  >;
};

type PackagistSearch = {
  results?: Array<{
    name?: string;
    repository?: string;
    url?: string;
  }>;
};

export default defineRegistry({
  id: "packagist",
  displayName: "Packagist",
  probe: async (name, http = new HttpClient(), timeoutMs) => {
    if (!name.includes("/")) return null;
    return probePackage(name, http, timeoutMs, 0.96, 0.78);
  },
  search: async (query, http = new HttpClient(), timeoutMs) => {
    const url = `https://packagist.org/search.json?q=${encodeURIComponent(query)}&per_page=5`;
    const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
    if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
    const res = await http.json<PackagistSearch>(url, init);
    if (res.status === 404 || !res.data?.results) return [];
    const inline: RegistryCandidate[] = [];
    const names: string[] = [];
    for (const hit of res.data.results.slice(0, 5)) {
      if (!hit.name) continue;
      names.push(hit.name);
      const got = candidateFromUrl({
        packageName: hit.name,
        url: hit.repository,
        urlField: "repository",
        confidence: 0.82,
        registryUrl: hit.url ?? `https://packagist.org/packages/${hit.name}`,
      });
      if (got) inline.push(got);
    }
    const packageCandidates = await Promise.all(
      names.map((name) => probePackage(name, http, timeoutMs, 0.82, 0.66)),
    );
    return [...inline, ...packageCandidates.flat()];
  },
});

async function probePackage(
  name: string,
  http: HttpClient,
  timeoutMs: number | undefined,
  sourceConfidence: number,
  homepageConfidence: number,
): Promise<ReadonlyArray<RegistryCandidate>> {
  const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
  if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
  const registryUrl = `https://repo.packagist.org/p2/${name}.json`;
  const res = await http.json<PackagistManifest>(registryUrl, init);
  if (res.status === 404 || !res.data?.packages) return [];
  const out: RegistryCandidate[] = [];
  for (const [packageName, versions] of Object.entries(res.data.packages)) {
    for (const v of versions ?? []) {
      const source = candidateFromUrl({
        packageName,
        url: v.source?.url,
        urlField: "source",
        confidence: sourceConfidence,
        registryUrl,
      });
      if (source) out.push(source);
      const homepage = candidateFromUrl({
        packageName,
        url: v.homepage,
        urlField: "homepage",
        confidence: homepageConfidence,
        registryUrl,
      });
      if (homepage) out.push(homepage);
      if (out.length > 0) return out;
    }
  }
  return out;
}
