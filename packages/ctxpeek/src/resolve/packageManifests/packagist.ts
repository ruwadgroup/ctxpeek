import { definePackageManifest } from "../definePackageManifest.js";
import { namesEqual, packagePathName } from "./util.js";

export default definePackageManifest({
  ecosystem: "packagist",
  filenames: ["composer.json"],
  candidateSubpaths: (packageName) => {
    const name = packagePathName(packageName);
    return [`packages/${name}`, `src/${name}`];
  },
  matches: (raw, packageName) => {
    const json = JSON.parse(raw) as { name?: string };
    return namesEqual(json.name, packageName);
  },
});
