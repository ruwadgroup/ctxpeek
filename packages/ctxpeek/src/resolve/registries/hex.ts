import { HttpClient } from "../../util/index.js";
import {
  candidateFromUrl,
  defineRegistry,
  type RegistryCandidate,
  type RegistryUrlField,
} from "../defineRegistry.js";

type HexManifest = {
  name?: string;
  meta?: { links?: Record<string, string> };
  html_url?: string;
};

export default defineRegistry({
  id: "hex",
  displayName: "Hex.pm",
  probe: async (name, http = new HttpClient(), timeoutMs) => {
    const init: { maxRetries: number; timeoutMs?: number } = { maxRetries: 1 };
    if (timeoutMs !== undefined) init.timeoutMs = timeoutMs;
    const registryUrl = `https://hex.pm/api/packages/${encodeURIComponent(name)}`;
    const res = await http.json<HexManifest>(registryUrl, init);
    if (res.status === 404 || !res.data) return null;
    const packageName = res.data.name ?? name;
    const out: RegistryCandidate[] = [];
    for (const [key, url] of Object.entries(res.data.meta?.links ?? {})) {
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
      url: res.data.html_url,
      urlField: "homepage",
      confidence: 0.5,
      registryUrl,
    });
    if (homepage) out.push(homepage);
    return out;
  },
});

function fieldForKey(key: string): RegistryUrlField {
  if (/source|repo|github|gitlab|bitbucket/i.test(key)) return "source-code";
  if (/bug|issue/i.test(key)) return "bugs";
  if (/home|doc/i.test(key)) return "homepage";
  return "other";
}

function confidenceForKey(key: string): number {
  const field = fieldForKey(key);
  if (field === "source-code") return 0.92;
  if (field === "homepage") return 0.72;
  if (field === "bugs") return 0.62;
  return 0.58;
}
