import { parse as parseToml } from "smol-toml";
import { defineLockfileParser } from "../defineLockfileParser.js";

export default defineLockfileParser({
  ecosystem: "pypi",
  filenames: ["pyproject.toml", "requirements.txt"],
  install: (name) => `pip install ${name}`,
  parse: (raw, filename) =>
    filename.endsWith("pyproject.toml") ? parsePyProject(raw) : parseRequirementsTxt(raw),
});

function parsePyProject(raw: string) {
  let toml: Record<string, unknown>;
  try {
    toml = parseToml(raw) as Record<string, unknown>;
  } catch {
    return [];
  }
  const project = toml["project"] as
    | {
        dependencies?: ReadonlyArray<string>;
      }
    | undefined;
  const poetry = (
    toml["tool"] as
      | {
          poetry?: { dependencies?: Record<string, string | { version?: string }> };
        }
      | undefined
  )?.poetry;
  const out: { name: string; version: string | undefined; direct: true }[] = [];
  for (const entry of project?.dependencies ?? []) {
    const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\s*(?:[<>=!~]=?|==)\s*([\w.+-]+))?/.exec(entry);
    if (!match || !match[1]) continue;
    out.push({ name: match[1], version: match[2], direct: true });
  }
  if (poetry?.dependencies) {
    for (const [name, spec] of Object.entries(poetry.dependencies)) {
      if (name.toLowerCase() === "python") continue;
      const version = typeof spec === "string" ? spec.replace(/^[~^]/, "") : spec.version;
      out.push({ name, version, direct: true });
    }
  }
  return out;
}

function parseRequirementsTxt(raw: string) {
  const out: { name: string; version: string | undefined; direct: true }[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.split("#")[0]?.trim() ?? "";
    if (!trimmed || trimmed.startsWith("-")) continue;
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\s*(?:[<>=!~]=?|==)\s*([\w.+-]+))?/.exec(trimmed);
    if (!m || !m[1]) continue;
    out.push({ name: m[1], version: m[2], direct: true });
  }
  return out;
}
