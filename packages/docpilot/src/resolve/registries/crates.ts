import { HttpClient } from "../../util/index.js";
import { candidateFromUrl, defineRegistry, type RegistryCandidate } from "../defineRegistry.js";

type CratesManifest = {
  crate?: { name?: string; repository?: string; homepage?: string };
};

type CratesSearch = {
  crates?: Array<{
    name?: string;
    repository?: string;
    homepage?: string;
  }>;
};

export default defineRegistry({
  id: "crates",
  displayName: "crates.io",
  probe: async (name, http = new HttpClient(), timeoutMs) => {
    const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
    if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
    const registryUrl = `https://crates.io/api/v1/crates/${encodeURIComponent(name)}`;
    const res = await http.json<CratesManifest>(registryUrl, init);
    if (res.status === 404 || !res.data?.crate) return null;
    return candidatesFromCrate(res.data.crate.name ?? name, registryUrl, res.data.crate, 0.96, 0.78);
  },
  search: async (query, http = new HttpClient(), timeoutMs) => {
    const url = `https://crates.io/api/v1/crates?q=${encodeURIComponent(query)}&per_page=5`;
    const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
    if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
    const res = await http.json<CratesSearch>(url, init);
    if (res.status === 404 || !res.data?.crates) return [];
    return res.data.crates.flatMap((crate) =>
      candidatesFromCrate(
        crate.name ?? query,
        crate.name ? `https://crates.io/crates/${encodeURIComponent(crate.name)}` : url,
        crate,
        0.82,
        0.66,
      ),
    );
  },
});

function candidatesFromCrate(
  packageName: string,
  registryUrl: string,
  crate: { repository?: string; homepage?: string },
  repositoryConfidence: number,
  homepageConfidence: number,
): ReadonlyArray<RegistryCandidate> {
  const out: RegistryCandidate[] = [];
  const repo = candidateFromUrl({
    packageName,
    url: crate.repository,
    urlField: "repository",
    confidence: repositoryConfidence,
    registryUrl,
  });
  if (repo) out.push(repo);
  const homepage = candidateFromUrl({
    packageName,
    url: crate.homepage,
    urlField: "homepage",
    confidence: homepageConfidence,
    registryUrl,
  });
  if (homepage) out.push(homepage);
  return out;
}
