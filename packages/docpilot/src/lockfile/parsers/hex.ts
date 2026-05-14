import { defineLockfileParser } from "../defineLockfileParser.js";

export default defineLockfileParser({
  ecosystem: "hex",
  filenames: ["mix.exs"],
  install: (name) => `mix deps.get  # add {:${name}, "~> ..."} to mix.exs`,
  parse: (raw) => {
    const out: { name: string; version: string | undefined; direct: true }[] = [];
    const depsBlock = /defp deps[^{]*do\s*\[([\s\S]*?)\]\s*end/.exec(raw);
    if (!depsBlock?.[1]) return out;
    for (const m of depsBlock[1].matchAll(/\{:([A-Za-z_][\w]*)\s*,\s*"([^"]+)"/g)) {
      const name = m[1];
      const versionRaw = m[2];
      if (!name) continue;
      out.push({
        name,
        version: versionRaw?.replace(/^[~^]\s*>?=?/, "").trim() || undefined,
        direct: true,
      });
    }
    return out;
  },
});
