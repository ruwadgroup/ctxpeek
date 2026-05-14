import { defineLockfileParser } from "../defineLockfileParser.js";

export default defineLockfileParser({
  ecosystem: "go",
  filenames: ["go.mod"],
  install: (name) => `go get ${name}`,
  parse: (raw) => {
    const out: { name: string; version: string | undefined; direct: true }[] = [];
    let inRequireBlock = false;
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (t.startsWith("require (")) {
        inRequireBlock = true;
        continue;
      }
      if (inRequireBlock && t === ")") {
        inRequireBlock = false;
        continue;
      }
      let body = t;
      if (t.startsWith("require ")) body = t.slice("require ".length);
      else if (!inRequireBlock) continue;
      const m = /^([A-Za-z0-9./_-]+)\s+(v\S+)/.exec(body);
      if (!m || !m[1]) continue;
      out.push({ name: m[1], version: m[2], direct: true });
    }
    return out;
  },
});
