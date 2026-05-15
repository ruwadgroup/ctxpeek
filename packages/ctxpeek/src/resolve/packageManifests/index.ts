// Built-in package-manifest verifiers. Each module self-registers via
// definePackageManifest. Adding Maven/NuGet/Swift/etc. should be one file here
// plus the matching registry and lockfile parser.

import crates from "./crates.js";
import go from "./go.js";
import hex from "./hex.js";
import npm from "./npm.js";
import packagist from "./packagist.js";
import pypi from "./pypi.js";
import rubygems from "./rubygems.js";

export const BUILT_IN_PACKAGE_MANIFESTS = [npm, pypi, crates, go, rubygems, packagist, hex] as const;
