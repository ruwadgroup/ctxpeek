import { parse as parseToml } from "smol-toml";
import { defineLockfileParser } from "../defineLockfileParser.js";

export default defineLockfileParser({
  ecosystem: "crates",
  filenames: ["Cargo.toml"],
  install: (name) => `cargo add ${name}`,
  parse: (raw) => {
    let toml: {
      dependencies?: Record<string, string | { version?: string }>;
      "dev-dependencies"?: Record<string, string | { version?: string }>;
    };
    try {
      toml = parseToml(raw) as typeof toml;
    } catch {
      return [];
    }
    const out: { name: string; version: string | undefined; direct: true }[] = [];
    for (const map of [toml.dependencies ?? {}, toml["dev-dependencies"] ?? {}]) {
      for (const [name, spec] of Object.entries(map)) {
        out.push({
          name,
          version: typeof spec === "string" ? spec : spec.version,
          direct: true,
        });
      }
    }
    return out;
  },
});
