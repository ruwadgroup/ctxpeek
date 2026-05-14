// Built-in registry probes. Each module self-registers via defineRegistry.
// Adding a registry = drop a file here + add one line below.

import crates from "./crates.js";
import go from "./go.js";
import hex from "./hex.js";
import npm from "./npm.js";
import packagist from "./packagist.js";
import pypi from "./pypi.js";
import rubygems from "./rubygems.js";

export const BUILT_IN_REGISTRIES = [npm, pypi, crates, go, rubygems, packagist, hex] as const;
