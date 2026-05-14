/**
 * Markdown tree renderer for `list_docs`.
 *
 * Produces the `├── 02-routing.mdx  8.7k  ✦` style output described in
 * design doc §6.2 (list_docs). ≈75% fewer tokens than equivalent JSON.
 */
import { formatBytes } from "../util/tokens.js";

export type TreeEntry = {
  readonly path: string;
  readonly size: number;
  readonly highSignal: boolean;
  readonly highlightedInNav: boolean;
  readonly recentlyChanged: boolean;
};

export type TreeOptions = {
  readonly repoLabel: string;
  readonly resolvedRef: string | undefined;
  readonly commitSha: string;
  readonly tokensApprox: number | undefined;
  readonly truncated: boolean;
  readonly subpath: string | undefined;
  readonly notes?: ReadonlyArray<string>;
};

type Node = {
  name: string;
  children: Map<string, Node>;
  entry?: TreeEntry;
};

export function renderTree(entries: ReadonlyArray<TreeEntry>, opts: TreeOptions): string {
  const root: Node = { name: "", children: new Map() };
  for (const e of entries) {
    const parts = e.path.split("/");
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i] ?? "";
      if (!name) continue;
      let next = cur.children.get(name);
      if (!next) {
        next = { name, children: new Map() };
        cur.children.set(name, next);
      }
      cur = next;
    }
    cur.entry = e;
  }

  const lines: string[] = [];
  const head = opts.resolvedRef ? `${opts.repoLabel}@${opts.resolvedRef}` : opts.repoLabel;
  lines.push(`# ${head} — docs`);
  lines.push("");
  const totalFiles = entries.length;
  const totalSize = entries.reduce((a, b) => a + b.size, 0);
  const tokenSummary = opts.tokensApprox !== undefined ? `, ~${formatNum(opts.tokensApprox)} tokens` : "";
  const truncated = opts.truncated ? " (tree truncated)" : "";
  lines.push(
    `> ${totalFiles} files, ${formatBytes(totalSize)}${tokenSummary}. Pin: ${opts.resolvedRef ?? "default"} → ${opts.commitSha.slice(0, 7)}.${truncated}`,
  );
  if (opts.subpath) lines.push(`> Subpath: ${opts.subpath}/`);
  lines.push("");

  if (root.children.size === 0) {
    lines.push("_No documentation files found in the tree._");
    return lines.join("\n");
  }

  renderChildren(root, "", lines);
  lines.push("");
  lines.push(
    "Legend: ✦ high-signal (top-level / llms.txt / framework nav), ✦✦ highlighted in repo nav, ⚠️ changed within last 7d.",
  );
  if (opts.notes && opts.notes.length > 0) {
    lines.push("");
    for (const n of opts.notes) lines.push(`> ${n}`);
  }
  lines.push("");
  lines.push(
    `Use: \`fetch_doc("${opts.repoLabel}${opts.resolvedRef ? `@${opts.resolvedRef}` : ""}", "<path>")\``,
  );
  return lines.join("\n");
}

function renderChildren(node: Node, prefix: string, lines: string[]): void {
  const children = [...node.children.values()].sort((a, b) => {
    const ad = a.children.size > 0 ? 0 : 1;
    const bd = b.children.size > 0 ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return a.name.localeCompare(b.name);
  });
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child) continue;
    const isLast = i === children.length - 1;
    const branch = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";
    const isDir = child.children.size > 0;
    const displayName = isDir ? `${child.name}/` : child.name;
    let suffix = "";
    if (child.entry) {
      const e = child.entry;
      const sizeStr = formatBytes(e.size).padStart(6);
      const flag = badges(e);
      suffix = `  ${sizeStr}${flag ? `  ${flag}` : ""}`;
    }
    lines.push(`${prefix}${branch}${displayName}${suffix}`);
    if (isDir) renderChildren(child, prefix + childPrefix, lines);
  }
}

function badges(e: TreeEntry): string {
  const parts: string[] = [];
  if (e.highlightedInNav) parts.push("✦✦");
  else if (e.highSignal) parts.push("✦");
  if (e.recentlyChanged) parts.push("⚠️");
  return parts.join(" ");
}

function formatNum(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
