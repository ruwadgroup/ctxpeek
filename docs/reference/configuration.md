# Configuration

## Discovery order

Highest precedence first:

1. CLI args to `ctxpeek` (`--token`, `--cache-dir`, `--no-cdn`, …)
2. `.ctxpeek.toml` in cwd or any ancestor directory up to `$HOME`
3. `~/.config/ctxpeek/config.toml`
4. Environment variables
5. Built-in defaults

Use the global file for machine/user defaults. Use project `.ctxpeek.toml` for repo-specific resolver policy, package mappings, and stricter choices for that project. Project config is merged over global config; for `[[package]]`, entries are merged by package name and the project entry wins when the same name exists in both places.

## File format

`.ctxpeek.toml`:

```toml
[cache]
dir              = "~/.cache/ctxpeek"   # default from env-paths
max_size         = "1GiB"
gc_days          = 14

[fetch]
prefer_cdn         = true                # true if no PAT
cdn_enabled        = true
concurrent_max     = 8
secondary_budget   = 60                  # req/min ceiling
honor_retry_after  = true

[auth]
github_token_env = "GITHUB_TOKEN"

[resolve]
ecosystems              = ["npm", "pypi", "crates", "go", "rubygems", "packagist", "hex"]
github_search_fallback  = true

[[package]]
name      = "@acme/ui"
spec      = "acme/web@main#packages/ui"
ecosystem = "npm"                     # optional

[experiments]
prewarm_from_lockfile = false            # reserved; no stable runtime behavior yet
```

## Keys

### `[cache]`

| Key        | Type               | Default                      | Notes                                         |
| ---------- | ------------------ | ---------------------------- | --------------------------------------------- |
| `dir`      | `string`           | `env-paths('ctxpeek').cache` | Cache root                                    |
| `max_size` | `string \| number` | `"1GiB"`                     | Cap; suffixes `K`, `M`, `G`, `Ki`, `Mi`, `Gi` |
| `gc_days`  | `number`           | `14`                         | Snapshot eviction age                         |

### `[fetch]`

| Key                 | Type      | Default      | Notes                                |
| ------------------- | --------- | ------------ | ------------------------------------ |
| `prefer_cdn`        | `boolean` | `!has_token` | Use jsDelivr first                   |
| `cdn_enabled`       | `boolean` | `true`       | Allow CDN reads                      |
| `concurrent_max`    | `number`  | `8`          | In-flight cap to GitHub              |
| `secondary_budget`  | `number`  | `60`         | Token-bucket req/min                 |
| `honor_retry_after` | `boolean` | `true`       | Honor Retry-After on 429/5xx retries |

### `[auth]`

| Key                | Type     | Default          | Notes           |
| ------------------ | -------- | ---------------- | --------------- |
| `github_token_env` | `string` | `"GITHUB_TOKEN"` | Env var to read |

### `[resolve]`

| Key                      | Type       | Default                                                     | Notes                        |
| ------------------------ | ---------- | ----------------------------------------------------------- | ---------------------------- |
| `ecosystems`             | `string[]` | `["npm","pypi","crates","go","rubygems","packagist","hex"]` | Probe order                  |
| `github_search_fallback` | `boolean`  | `true`                                                      | Allow `/search/repositories` |

### `[[package]]`

Deterministic package-to-repo mappings. These are checked before local manifests, package registries, and public forge search. This is the safest current mechanism for private packages and internal monorepos because committed project config can point an import name at the exact repo/ref/subpath without storing credentials.

| Key         | Type      | Notes                                                                                  |
| ----------- | --------- | -------------------------------------------------------------------------------------- |
| `name`      | `string`  | Package name or scoped package, for example `@acme/ui`                                 |
| `spec`      | `string`  | Any ctxpeek repo spec: `[forge:]owner/repo[@ref][#subpath]`                            |
| `ecosystem` | `string?` | Optional ecosystem hint; if present, must be one of the configured resolver ecosystems |

Example project config:

```toml
[[package]]
name = "@acme/ui"
spec = "acme/web@v2.4.1#packages/ui"
ecosystem = "npm"

[[package]]
name = "@acme/auth"
spec = "acme/platform@main#packages/auth"
ecosystem = "npm"
```

Resolver priority:

1. `[[package]]` mappings from project/global config
2. Local project/workspace manifests and `repository.directory`
3. Public package registries in `[resolve] ecosystems`
4. Public forge search when `github_search_fallback = true`

Fetch policy is separate from resolver priority. Public GitHub/GitLab repos still prefer cache → CDN → REST/ETag. If the CDN cannot serve a commit or private repo, ctxpeek falls through to the forge API instead of treating the CDN miss as the final answer.

### `[experiments]`

| Key                     | Type      | Default | Notes                                                                 |
| ----------------------- | --------- | ------- | --------------------------------------------------------------------- |
| `prewarm_from_lockfile` | `boolean` | `false` | Reserved for a future MCP-roots flow; currently accepted but not used |

## Environment variables

| Variable            | Behavior                                                         |
| ------------------- | ---------------------------------------------------------------- |
| `GITHUB_TOKEN`      | GitHub token, unless `[auth] github_token_env` names another env |
| `GITLAB_TOKEN`      | Token for `gitlab:` / `gl:` repo specs                           |
| `BITBUCKET_TOKEN`   | Bearer token for `bitbucket:` / `bb:` repo specs                 |
| `CTXPEEK_LOG_LEVEL` | `"debug" \| "info" \| "warn" \| "error"`                         |

## CLI flags

```text
ctxpeek [options]

  --token <token>          override GITHUB_TOKEN
  --cache-dir <path>       override [cache] dir
  --no-cdn                 disable CDN reads
  --cdn-only               prefer CDN reads before REST
  --config <path>          explicit .ctxpeek.toml path
  --log-level <level>      debug | info | warn | error
  --help, -h               show this message
  --version, -v            print version
```
