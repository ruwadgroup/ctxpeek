import { definePackageManifest } from "../definePackageManifest.js";
import { namesEqual } from "./util.js";

export default definePackageManifest({
  ecosystem: "go",
  filenames: ["go.mod"],
  matches: (raw, packageName) => {
    const moduleName = /^module\s+(\S+)/m.exec(raw)?.[1];
    return namesEqual(moduleName, packageName) || Boolean(moduleName?.endsWith(`/${packageName}`));
  },
});
