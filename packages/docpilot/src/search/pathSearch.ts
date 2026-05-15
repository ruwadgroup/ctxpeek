// Path-only doc search — score doc file paths against a query without
// fetching any file contents. ~1s on any repo because all we need is the
// tree (which is already cached per commit SHA).
import { docTier } from "../format/docsPaths.js";

export function tokenizeQuery(text: string): ReadonlyArray<string> {
  return text
    .toLowerCase()
    .split(/[\s\W_]+/u)
    .filter((t) => t.length >= 2);
}

export function scorePathAgainstQuery(filePath: string, queryTokens: ReadonlyArray<string>): number {
  const lower = filePath.toLowerCase();
  const stem = (lower.split("/").pop() ?? "").replace(/\.(md|mdx|rst|adoc|txt)$/i, "");
  const pathTokens = new Set(lower.split(/[/\-_.\d]+/).filter((t) => t.length >= 2));

  let score = 0;
  let matchedAny = false;
  for (const q of queryTokens) {
    if (stem === q) {
      score += 100;
      matchedAny = true;
      continue;
    }
    if (stem.includes(q)) {
      score += 40;
      matchedAny = true;
      continue;
    }
    if (pathTokens.has(q)) {
      score += 20;
      matchedAny = true;
      continue;
    }
    for (const t of pathTokens) {
      if (t.startsWith(q) || q.startsWith(t)) {
        score += 8;
        matchedAny = true;
        break;
      }
    }
  }

  if (!matchedAny) return 0;
  score -= docTier(filePath) * 4;
  score -= Math.max(0, filePath.split("/").length - 2) * 2;
  return score;
}

// Turn "docs/02-app/04-deep-dive/05-middleware.mdx" into a readable breadcrumb
// so the model has *some* context without us fetching the file.
export function synthesizePathSnippet(filePath: string): string {
  return filePath
    .split("/")
    .map((seg) => seg.replace(/\.(md|mdx|rst|adoc|txt)$/i, ""))
    .map((seg) => seg.replace(/^\d+[-_]/, ""))
    .map((seg) => seg.replace(/[-_]/g, " "))
    .join(" · ");
}
