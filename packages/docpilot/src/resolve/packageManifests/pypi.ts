import { parse as parseToml } from "smol-toml";
import { definePackageManifest } from "../definePackageManifest.js";
import { namesEqual, packagePathName } from "./util.js";

export default definePackageManifest({
  ecosystem: "pypi",
  filenames: ["pyproject.toml"],
  candidateSubpaths: (packageName) => {
    const name = packagePathName(packageName);
    return [`packages/${name}`, `python/${name}`, `libs/${name}`];
  },
  matches: (raw, packageName) => {
    const toml = parseToml(raw) as {
      project?: { name?: string };
      tool?: { poetry?: { name?: string } };
    };
    return namesEqual(toml.project?.name, packageName) || namesEqual(toml.tool?.poetry?.name, packageName);
  },
});
