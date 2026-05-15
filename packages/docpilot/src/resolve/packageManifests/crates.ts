import { parse as parseToml } from "smol-toml";
import { definePackageManifest } from "../definePackageManifest.js";
import { namesEqual, packagePathName } from "./util.js";

export default definePackageManifest({
  ecosystem: "crates",
  filenames: ["Cargo.toml"],
  candidateSubpaths: (packageName) => {
    const name = packagePathName(packageName);
    return [`crates/${name}`, `packages/${name}`];
  },
  matches: (raw, packageName) => {
    const toml = parseToml(raw) as { package?: { name?: string } };
    return namesEqual(toml.package?.name, packageName);
  },
});
