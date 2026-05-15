# Configuration

## Discovery order

Highest precedence first:

1. CLI args to `docpilot` (`--token`, `--cache-dir`, `--no-cdn`, …)
2. `.docpilot.toml` in cwd or any ancestor directory up to `$HOME`
3. `~/.config/docpilot/config.toml`
4. Environment variables
5. Built-in defaults

## File format

`.docpilot.toml`:

```toml
[cache]
dir              = "~/.cache/docpilot"   # default from env-paths
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

[experiments]
prewarm_from_lockfile = false            # reserved; no stable runtime behavior yet
```

## Keys

### `[cache]`

| Key        | Type               | Default                       | Notes                                         |
| ---------- | ------------------ | ----------------------------- | --------------------------------------------- |
| `dir`      | `string`           | `env-paths('docpilot').cache` | Cache root                                    |
| `max_size` | `string \| number` | `"1GiB"`                      | Cap; suffixes `K`, `M`, `G`, `Ki`, `Mi`, `Gi` |
| `gc_days`  | `number`           | `14`                          | Snapshot eviction age                         |

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

### `[experiments]`

| Key                     | Type      | Default | Notes                                                                 |
| ----------------------- | --------- | ------- | --------------------------------------------------------------------- |
| `prewarm_from_lockfile` | `boolean` | `false` | Reserved for a future MCP-roots flow; currently accepted but not used |

## Environment variables

| Variable             | Behavior                                                         |
| -------------------- | ---------------------------------------------------------------- |
| `GITHUB_TOKEN`       | GitHub token, unless `[auth] github_token_env` names another env |
| `GITLAB_TOKEN`       | Token for `gitlab:` / `gl:` repo specs                           |
| `BITBUCKET_TOKEN`    | Bearer token for `bitbucket:` / `bb:` repo specs                 |
| `DOCPILOT_LOG_LEVEL` | `"debug" \| "info" \| "warn" \| "error"`                         |

## CLI flags

```text
docpilot [options]

  --token <token>          override GITHUB_TOKEN
  --cache-dir <path>       override [cache] dir
  --no-cdn                 disable CDN reads
  --cdn-only               prefer CDN reads before REST
  --config <path>          explicit .docpilot.toml path
  --log-level <level>      debug | info | warn | error
  --help, -h               show this message
  --version, -v            print version
```
