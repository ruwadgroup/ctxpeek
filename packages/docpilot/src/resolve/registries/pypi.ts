import { HttpClient } from "../../util/index.js";
import {
  candidateFromUrl,
  defineRegistry,
  type RegistryCandidate,
  type RegistryUrlField,
} from "../defineRegistry.js";

type PyPiManifest = {
  info?: {
    name?: string;
    home_page?: string;
    project_urls?: Record<string, string>;
  };
};

const PRIORITY_KEYS = ["Source", "Source Code", "Repository", "GitHub", "Code"] as const;

export default defineRegistry({
  id: "pypi",
  displayName: "PyPI",
  probe: async (name, http = new HttpClient(), timeoutMs) => {
    const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
    if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
    const registryUrl = `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;
    const res = await http.json<PyPiManifest>(registryUrl, init);
    if (res.status === 404 || !res.data?.info) return null;
    const packageName = res.data.info.name ?? name;
    const urls = res.data.info.project_urls ?? {};
    const out: RegistryCandidate[] = [];
    for (const k of PRIORITY_KEYS) {
      const got = candidateFromUrl({
        packageName,
        url: urls[k],
        urlField: "source-code",
        confidence: 0.95,
        registryUrl,
      });
      if (got) out.push(got);
    }
    for (const [key, url] of Object.entries(urls)) {
      if ((PRIORITY_KEYS as ReadonlyArray<string>).includes(key)) continue;
      const got = candidateFromUrl({
        packageName,
        url,
        urlField: fieldForKey(key),
        confidence: confidenceForKey(key),
        registryUrl,
      });
      if (got) out.push(got);
    }
    const homepage = candidateFromUrl({
      packageName,
      url: res.data.info.home_page,
      urlField: "homepage",
      confidence: 0.78,
      registryUrl,
    });
    if (homepage) out.push(homepage);
    return out;
  },
});

function fieldForKey(key: string): RegistryUrlField {
  if (/bug|issue/i.test(key)) return "bugs";
  if (/home/i.test(key)) return "homepage";
  if (/source|code|repo|github|gitlab|bitbucket/i.test(key)) return "source-code";
  return "other";
}

function confidenceForKey(key: string): number {
  const field = fieldForKey(key);
  if (field === "source-code") return 0.9;
  if (field === "homepage") return 0.76;
  if (field === "bugs") return 0.66;
  return 0.62;
}
