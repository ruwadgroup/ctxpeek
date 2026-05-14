import { defineLockfileParser } from "../defineLockfileParser.js";

export default defineLockfileParser({
  ecosystem: "packagist",
  filenames: ["composer.json"],
  install: (name) => `composer require ${name}`,
  parse: (raw) => {
    let json: {
      require?: Record<string, string>;
      "require-dev"?: Record<string, string>;
    };
    try {
      json = JSON.parse(raw) as typeof json;
    } catch {
      return [];
    }
    const out: { name: string; version: string | undefined; direct: true }[] = [];
    for (const map of [json.require ?? {}, json["require-dev"] ?? {}]) {
      for (const [name, spec] of Object.entries(map)) {
        if (name === "php" || name.startsWith("ext-")) continue;
        const m = /(\d+\.\d+\.\d+)/.exec(spec ?? "");
        out.push({ name, version: m?.[1], direct: true });
      }
    }
    return out;
  },
});
