import { definePackageManifest } from "../definePackageManifest.js";
import { namesEqual, packagePathName } from "./util.js";

export default definePackageManifest({
  ecosystem: "npm",
  filenames: ["package.json"],
  candidateSubpaths: (packageName) => {
    const name = packagePathName(packageName);
    return [`packages/${name}`, `pkg/${name}`, `libs/${name}`];
  },
  matches: (raw, packageName) => {
    const json = JSON.parse(raw) as { name?: string };
    return namesEqual(json.name, packageName);
  },
});
