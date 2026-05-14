import { defineLockfileParser } from "../defineLockfileParser.js";

export default defineLockfileParser({
  ecosystem: "npm",
  filenames: ["package.json"],
  install: (name) => `npm install ${name}`,
  parse: (raw) => {
    let json: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    try {
      json = JSON.parse(raw) as typeof json;
    } catch {
      return [];
    }
    const direct = new Map<string, string>();
    for (const [name, range] of Object.entries(json.dependencies ?? {})) direct.set(name, range);
    for (const [name, range] of Object.entries(json.devDependencies ?? {})) direct.set(name, range);

    return [...direct].map(([name, range]) => ({
      name,
      version: cleanNpmRange(range),
      direct: true,
    }));
  },
});

function cleanNpmRange(range: string): string | undefined {
  const m = /^[~^]?(\d+\.\d+\.\d+[\w.+-]*)$/.exec(range.trim());
  return m?.[1];
}
