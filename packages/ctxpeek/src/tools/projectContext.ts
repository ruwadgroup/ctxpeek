import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CtxpeekConfig, Ecosystem, PackageMapping } from "../config.js";
import {
  type DetectedManifest,
  detectProjectManifests,
  installSuggestion,
  type LockedDep,
} from "../lockfile.js";
import { extractRepo } from "../resolve/extractGithub.js";

export type ProjectManifestMatch = {
  readonly depName: string;
  readonly ecosystem: Ecosystem;
  readonly manifestFile: string;
  readonly repoSpec?: string;
};

export type ConfiguredPackageMatch = {
  readonly depName: string;
  readonly ecosystem: Ecosystem | undefined;
  readonly repoSpec: string;
};

type PackageJson = {
  readonly name?: string;
  readonly repository?: { readonly url?: string; readonly directory?: string } | string;
  readonly workspaces?: ReadonlyArray<string> | { readonly packages?: ReadonlyArray<string> };
};

type WorkspacePackagesObject = { readonly packages?: ReadonlyArray<string> };

const MAX_WORKSPACE_PACKAGES = 250;

export function findConfiguredPackageMapping(
  config: CtxpeekConfig,
  query: string,
  ecosystem?: Ecosystem,
): ConfiguredPackageMatch | null {
  const normQuery = normaliseDepName(query);
  const eligible = config.resolve.packageMappings.filter(
    (mapping) => !ecosystem || !mapping.ecosystem || mapping.ecosystem === ecosystem,
  );
  const exact = eligible.find((mapping) => normaliseDepName(mapping.name) === normQuery);
  const scoped = [...eligible]
    .filter((mapping) => {
      const scope = scopeOf(mapping.name);
      return scope && normaliseDepName(scope) === normQuery;
    })
    .sort(comparePackageMappings)[0];
  const match = exact ?? scoped;
  if (!match) return null;
  return {
    depName: match.name,
    ecosystem: match.ecosystem,
    repoSpec: match.spec,
  };
}

export async function findProjectManifestMatch(query: string): Promise<ProjectManifestMatch | null> {
  const manifests = await detectProjectManifests(process.cwd());
  if (manifests.length === 0) return null;
  const normQuery = normaliseDepName(query);

  const localPackage = await findLocalPackageMatch(manifests, normQuery);
  if (localPackage) return localPackage;

  const directDep = findExactDepMatch(manifests, normQuery);
  if (directDep) return directDep;

  const scopedDep = findScopeDepMatch(manifests, normQuery);
  if (scopedDep) return scopedDep;

  return findWorkspacePackageMatch(manifests, normQuery);
}

export async function offerProjectInstall(query: string, ecosystem: Ecosystem): Promise<string | null> {
  try {
    const manifests = await detectProjectManifests(process.cwd());
    if (manifests.length === 0) return null;
    const matching = manifests.find((m) => m.ecosystem === ecosystem);
    if (!matching) return null;
    const present = matching.deps.some(
      (d: LockedDep) => normaliseDepName(d.name) === normaliseDepName(query),
    );
    if (present) return null;
    return `> Not in your ${path.basename(matching.file)} - \`${installSuggestion(query, ecosystem)}\` to add it.`;
  } catch {
    return null;
  }
}

function findExactDepMatch(
  manifests: ReadonlyArray<DetectedManifest>,
  normQuery: string,
): ProjectManifestMatch | null {
  for (const manifest of manifests) {
    for (const dep of manifest.deps) {
      if (normaliseDepName(dep.name) === normQuery) {
        return { depName: dep.name, ecosystem: manifest.ecosystem, manifestFile: manifest.file };
      }
    }
  }
  return null;
}

function findScopeDepMatch(
  manifests: ReadonlyArray<DetectedManifest>,
  normQuery: string,
): ProjectManifestMatch | null {
  const matches: ProjectManifestMatch[] = [];
  for (const manifest of manifests) {
    for (const dep of manifest.deps) {
      const scope = scopeOf(dep.name);
      if (scope && normaliseDepName(scope) === normQuery) {
        matches.push({ depName: dep.name, ecosystem: manifest.ecosystem, manifestFile: manifest.file });
      }
    }
  }
  return [...matches].sort((a, b) => a.depName.localeCompare(b.depName))[0] ?? null;
}

async function findLocalPackageMatch(
  manifests: ReadonlyArray<DetectedManifest>,
  normQuery: string,
): Promise<ProjectManifestMatch | null> {
  for (const manifest of manifests.filter((m) => isPackageJson(m.file))) {
    const pkg = await readPackageJson(manifest.file);
    if (!pkg?.name || !nameMatches(pkg.name, normQuery)) continue;
    return {
      depName: pkg.name,
      ecosystem: "npm",
      manifestFile: manifest.file,
      ...(repoSpecForPackage(pkg, path.dirname(manifest.file), path.dirname(manifest.file)) ?? {}),
    };
  }
  return null;
}

async function findWorkspacePackageMatch(
  manifests: ReadonlyArray<DetectedManifest>,
  normQuery: string,
): Promise<ProjectManifestMatch | null> {
  for (const manifest of manifests.filter((m) => isPackageJson(m.file))) {
    const rootDir = path.dirname(manifest.file);
    const rootPkg = await readPackageJson(manifest.file);
    const patterns = workspacePatterns(rootPkg);
    if (patterns.length === 0) continue;
    const packageFiles = await expandWorkspacePackageJsons(rootDir, patterns);
    const rootRepo = repoSpecForPackage(rootPkg, rootDir, rootDir);
    for (const packageFile of packageFiles) {
      const pkg = await readPackageJson(packageFile);
      if (!pkg?.name || !nameMatches(pkg.name, normQuery)) continue;
      const packageDir = path.dirname(packageFile);
      return {
        depName: pkg.name,
        ecosystem: "npm",
        manifestFile: packageFile,
        ...(repoSpecForPackage(pkg, packageDir, rootDir) ?? repoSpecFromRoot(rootRepo, packageDir, rootDir)),
      };
    }
  }
  return null;
}

function repoSpecForPackage(
  pkg: PackageJson | null,
  packageDir: string,
  repoRoot: string,
): { repoSpec: string } | null {
  if (!pkg?.repository) return null;
  const repoUrl = typeof pkg.repository === "string" ? pkg.repository : pkg.repository.url;
  const got = extractRepo(repoUrl);
  if (!got) return null;
  const configuredDirectory =
    typeof pkg.repository === "string" ? undefined : cleanSubpath(pkg.repository.directory);
  const inferredDirectory = cleanSubpath(path.relative(repoRoot, packageDir));
  const subpath =
    configuredDirectory || (inferredDirectory && inferredDirectory !== "." ? inferredDirectory : "");
  return { repoSpec: formatRepoSpec(got, subpath) };
}

function repoSpecFromRoot(
  rootRepo: { repoSpec: string } | null,
  packageDir: string,
  repoRoot: string,
): { repoSpec: string } | null {
  if (!rootRepo) return null;
  const subpath = cleanSubpath(path.relative(repoRoot, packageDir));
  if (!subpath || subpath === ".") return rootRepo;
  return { repoSpec: `${rootRepo.repoSpec.replace(/#.*$/, "")}#${subpath}` };
}

function formatRepoSpec(
  repo: { forge: string; owner: string; repo: string },
  subpath: string | undefined,
): string {
  const prefix = repo.forge === "github" ? "" : `${repo.forge}:`;
  return `${prefix}${repo.owner}/${repo.repo}${subpath ? `#${subpath}` : ""}`;
}

async function expandWorkspacePackageJsons(
  rootDir: string,
  patterns: ReadonlyArray<string>,
): Promise<ReadonlyArray<string>> {
  const out = new Set<string>();
  for (const pattern of patterns) {
    if (pattern.startsWith("!")) continue;
    for (const candidate of await expandWorkspacePattern(rootDir, pattern)) {
      out.add(candidate);
      if (out.size >= MAX_WORKSPACE_PACKAGES) return [...out];
    }
  }
  return [...out];
}

async function expandWorkspacePattern(rootDir: string, pattern: string): Promise<ReadonlyArray<string>> {
  const segments = pattern.split(/[\\/]/).filter(Boolean);
  const pointsToPackageJson = segments[segments.length - 1] === "package.json";
  const dirs = await expandSegments(rootDir, pointsToPackageJson ? segments.slice(0, -1) : segments);
  return dirs.map((dir) => path.join(dir, "package.json"));
}

async function expandSegments(base: string, segments: ReadonlyArray<string>): Promise<ReadonlyArray<string>> {
  if (segments.length === 0) return [base];
  const [head, ...tail] = segments;
  if (!head) return [base];
  if (head === "*") {
    const dirs = await childDirectories(base);
    const nested = await Promise.all(dirs.map((dir) => expandSegments(dir, tail)));
    return nested.flat();
  }
  if (head === "**") {
    return [];
  }
  return expandSegments(path.join(base, head), tail);
}

async function childDirectories(dir: string): Promise<ReadonlyArray<string>> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

async function readPackageJson(filePath: string): Promise<PackageJson | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

function workspacePatterns(pkg: PackageJson | null): ReadonlyArray<string> {
  if (!pkg?.workspaces) return [];
  const workspaces = pkg.workspaces;
  if (Array.isArray(workspaces)) return workspaces;
  if (isWorkspacePackagesObject(workspaces)) return workspaces.packages ?? [];
  return [];
}

function isWorkspacePackagesObject(value: unknown): value is WorkspacePackagesObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nameMatches(packageName: string, normQuery: string): boolean {
  return (
    normaliseDepName(packageName) === normQuery || normaliseDepName(scopeOf(packageName) ?? "") === normQuery
  );
}

function scopeOf(name: string): string | null {
  if (!name.startsWith("@")) return null;
  const slash = name.indexOf("/");
  if (slash < 0) return null;
  return name.slice(1, slash);
}

function normaliseDepName(s: string): string {
  return s.toLowerCase().replace(/[._-]/g, "");
}

function cleanSubpath(s: string | undefined): string {
  return (s ?? "").replace(/^\/+/, "").replace(/\/+$/, "");
}

function isPackageJson(filePath: string): boolean {
  return path.basename(filePath) === "package.json";
}

function comparePackageMappings(a: PackageMapping, b: PackageMapping): number {
  return a.name.localeCompare(b.name);
}
