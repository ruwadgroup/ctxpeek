// Built-in forges. Each module self-registers via defineForge.
// Adding a forge = drop a file here + add one line below.

import bitbucket from "./bitbucket.js";
import github from "./github.js";
import gitlab from "./gitlab.js";

export const BUILT_IN_FORGES = [github, gitlab, bitbucket] as const;
