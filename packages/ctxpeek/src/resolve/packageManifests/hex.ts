import { definePackageManifest } from "../definePackageManifest.js";
import { namesEqual } from "./util.js";

export default definePackageManifest({
  ecosystem: "hex",
  filenames: ["mix.exs"],
  matches: (raw, packageName) => {
    const appName = /app:\s*:([a-zA-Z0-9_]+)/.exec(raw)?.[1];
    return namesEqual(appName, packageName);
  },
});
