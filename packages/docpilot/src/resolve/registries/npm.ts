import { HttpClient } from "../../util/index.js";
import { candidateFromUrl, defineRegistry, type RegistryCandidate } from "../defineRegistry.js";

type NpmManifest = {
  name?: string;
  repository?: { url?: string; directory?: string } | string;
  homepage?: string;
  bugs?: { url?: string } | string;
};

type NpmSearch = {
  objects?: Array<{
    package?: {
      name?: string;
      links?: {
        npm?: string;
        repository?: string;
        homepage?: string;
        bugs?: string;
      };
    };
  }>;
};

export default defineRegistry({
  id: "npm",
  displayName: "npm",
  probe: async (name, http = new HttpClient(), timeoutMs) => {
    const slug = encodeURIComponent(name).replace(/^%40/, "@").replace(/%2F/g, "/");
    const registryUrl = `https://registry.npmjs.org/${slug}`;
    const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
    if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
    const res = await http.json<NpmManifest>(registryUrl, init);
    if (res.status === 404 || !res.data) return null;
    return candidatesFromManifest(res.data.name ?? name, registryUrl, res.data);
  },
  search: async (query, http = new HttpClient(), timeoutMs) => {
    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=5`;
    const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
    if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
    const res = await http.json<NpmSearch>(url, init);
    if (res.status === 404 || !res.data?.objects) return [];
    const out: RegistryCandidate[] = [];
    for (const hit of res.data.objects) {
      const pkg = hit.package;
      if (!pkg?.name) continue;
      const registryUrl = pkg.links?.npm ?? `https://www.npmjs.com/package/${encodeURIComponent(pkg.name)}`;
      const repo = candidateFromUrl({
        packageName: pkg.name,
        url: pkg.links?.repository,
        urlField: "repository",
        confidence: 0.82,
        registryUrl,
      });
      if (repo) out.push(repo);
      const homepage = candidateFromUrl({
        packageName: pkg.name,
        url: pkg.links?.homepage,
        urlField: "homepage",
        confidence: 0.68,
        registryUrl,
      });
      if (homepage) out.push(homepage);
      const bugs = candidateFromUrl({
        packageName: pkg.name,
        url: pkg.links?.bugs,
        urlField: "bugs",
        confidence: 0.6,
        registryUrl,
      });
      if (bugs) out.push(bugs);
    }
    return out;
  },
});

function candidatesFromManifest(
  packageName: string,
  registryUrl: string,
  manifest: NpmManifest,
): ReadonlyArray<RegistryCandidate> {
  const out: RegistryCandidate[] = [];
  const repoUrl = typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
  const directory = typeof manifest.repository === "string" ? undefined : manifest.repository?.directory;
  const repo = candidateFromUrl({
    packageName,
    url: repoUrl,
    urlField: "repository",
    confidence: 0.96,
    registryUrl,
    ...(directory !== undefined ? { subpath: directory } : {}),
  });
  if (repo) out.push(repo);
  const homepage = candidateFromUrl({
    packageName,
    url: manifest.homepage,
    urlField: "homepage",
    confidence: 0.78,
    registryUrl,
  });
  if (homepage) out.push(homepage);
  const bugs = typeof manifest.bugs === "string" ? manifest.bugs : manifest.bugs?.url;
  const bugTracker = candidateFromUrl({
    packageName,
    url: bugs,
    urlField: "bugs",
    confidence: 0.68,
    registryUrl,
  });
  if (bugTracker) out.push(bugTracker);
  return out;
}
