import { defineLockfileParser } from "../defineLockfileParser.js";

export default defineLockfileParser({
  ecosystem: "rubygems",
  filenames: ["Gemfile"],
  install: (name) => `bundle add ${name}`,
  parse: (raw) => {
    const out: { name: string; version: string | undefined; direct: true }[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/.exec(line);
      if (!m?.[1]) continue;
      const version = m[2]?.replace(/^[~^]\s*>?=?/, "").trim();
      out.push({ name: m[1], version: version || undefined, direct: true });
    }
    return out;
  },
});
