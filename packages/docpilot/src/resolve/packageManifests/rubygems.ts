import { definePackageManifest } from "../definePackageManifest.js";
import { namesEqual } from "./util.js";

export default definePackageManifest({
  ecosystem: "rubygems",
  filenames: ["package.gemspec"],
  matches: (raw, packageName) => {
    const gemName = /\.name\s*=\s*["']([^"']+)["']/.exec(raw)?.[1];
    return namesEqual(gemName, packageName);
  },
});
