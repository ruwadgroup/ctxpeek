/**
 * Classify which files in a repo tree look like documentation.
 *
 * Strategy:
 *   - extension allowlist: .md, .mdx, .rst, .adoc, .txt for known doc files
 *   - known docs dirs: docs/, documentation/, website/docs/, apps/docs/, doc/
 *   - top-level README, CHANGELOG, MIGRATION, UPGRADE, CONTRIBUTING
 *   - llms.txt and llms-full.txt anywhere are always docs
 *   - examples/ + cookbook/ are docs when include_examples=true
 *
 * Anything else (source code, config, lockfiles, binaries) is excluded.
 */

const DOC_EXTS = new Set([".md", ".mdx", ".rst", ".adoc", ".txt"]);
const TOP_LEVEL_DOCS = new Set([
  "readme.md",
  "readme.mdx",
  "readme",
  "readme.rst",
  "changelog.md",
  "changelog",
  "history.md",
  "migration.md",
  "upgrade.md",
  "contributing.md",
  "code_of_conduct.md",
  "security.md",
  "authors.md",
  "license",
  "license.md",
  "llms.txt",
  "llms-full.txt",
]);
const DOC_DIRS = [
  "docs/",
  "documentation/",
  "doc/",
  "website/docs/",
  "apps/docs/",
  "site/docs/",
  "guides/",
  "guide/",
];
const EXAMPLE_DIRS = ["examples/", "example/", "cookbook/", "samples/"];

export type ClassifyOptions = {
  readonly includeExamples?: boolean;
  readonly subpath?: string;
};

export function isDocPath(filePath: string, opts: ClassifyOptions = {}): boolean {
  const lower = filePath.toLowerCase();
  if (opts.subpath) {
    const sub = opts.subpath.endsWith("/") ? opts.subpath : `${opts.subpath}/`;
    if (!lower.startsWith(sub.toLowerCase()) && lower !== opts.subpath.toLowerCase()) return false;
  }
  if (lower.includes("/node_modules/")) return false;
  if (lower.endsWith("llms.txt") || lower.endsWith("llms-full.txt")) return true;

  const base = lower.split("/").pop() ?? "";
  if (!lower.includes("/") && TOP_LEVEL_DOCS.has(base)) return true;

  const ext = extOf(lower);
  if (!DOC_EXTS.has(ext)) return false;

  if (DOC_DIRS.some((d) => lower.startsWith(d) || lower.includes(`/${d}`))) return true;
  if (opts.includeExamples && EXAMPLE_DIRS.some((d) => lower.startsWith(d) || lower.includes(`/${d}`)))
    return true;

  return false;
}

export function classifyTree<
  T extends {
    path: string;
    type: "blob" | "tree" | "commit";
    size?: number;
  },
>(entries: ReadonlyArray<T>, opts: ClassifyOptions = {}): ReadonlyArray<T> {
  return entries.filter((e) => e.type === "blob" && isDocPath(e.path, opts));
}

/**
 * Doc-tier ranking so we can cap indexing at the top N files for huge repos
 * (next.js, react). Lower number = higher priority.
 *
 *   0  llms.txt / llms-full.txt — curated, AI-targeted
 *   1  top-level README / CHANGELOG / MIGRATION (immediate signal)
 *   2  files directly under docs/, documentation/, guide/ (canonical docs)
 *   3  other doc dirs (apps/docs/, website/docs/, etc.)
 *   4  per-package READMEs in a monorepo (packages/* /README.md)
 *   5  everything else that survived `isDocPath`
 */
export function docTier(filePath: string): number {
  const lower = filePath.toLowerCase();
  if (lower.endsWith("llms.txt") || lower.endsWith("llms-full.txt")) return 0;
  if (!lower.includes("/")) return 1;
  if (
    lower.startsWith("docs/") ||
    lower.startsWith("documentation/") ||
    lower.startsWith("doc/") ||
    lower.startsWith("guide/") ||
    lower.startsWith("guides/")
  ) {
    return 2;
  }
  if (lower.startsWith("apps/docs/") || lower.startsWith("website/docs/") || lower.startsWith("site/docs/")) {
    return 3;
  }
  if (/^packages\/[^/]+\/readme\.(md|mdx|rst)$/i.test(filePath)) return 4;
  return 5;
}

function extOf(p: string): string {
  const i = p.lastIndexOf(".");
  if (i < 0) return "";
  return p.slice(i);
}
