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
concurrent_max     = 8
secondary_budget   = 60                  # req/min ceiling
honor_retry_after  = true

[auth]
github_token_env = "GITHUB_TOKEN"

[resolve]
ecosystems              = ["npm", "pypi", "crates", "go", "rubygems"]
github_search_fallback  = true

[experiments]
prewarm_from_lockfile = true             # opt-in via MCP `roots` capability
```

## Keys

### `[cache]`

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `dir` | `string` | `env-paths('docpilot').cache` | Cache root |
| `max_size` | `string \| number` | `"1GiB"` | Cap; suffixes `K`, `M`, `G`, `Ki`, `Mi`, `Gi` |
| `gc_days` | `number` | `14` | Snapshot eviction age |

### `[fetch]`

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `prefer_cdn` | `boolean` | `!has_token` | Use jsDelivr first |
| `concurrent_max` | `number` | `8` | In-flight cap to GitHub |
| `secondary_budget` | `number` | `60` | Token-bucket req/min |
| `honor_retry_after` | `boolean` | `true` | Honor 429/403 Retry-After |

### `[auth]`

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `github_token_env` | `string` | `"GITHUB_TOKEN"` | Env var to read |

### `[resolve]`

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `ecosystems` | `string[]` | `["npm","pypi","crates","go","rubygems"]` | Probe order |
| `github_search_fallback` | `boolean` | `true` | Allow `/search/repositories` |

### `[experiments]`

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `prewarm_from_lockfile` | `boolean` | `true` | Read `package.json` / `requirements.txt` / `Cargo.toml` to warm the resolve cache |

## Environment variables

| Variable | Equivalent key |
| --- | --- |
| `GITHUB_TOKEN` | `[auth] github_token_env` value |
| `GITHUB_APP_ID` | (advanced) GitHub App mode |
| `GITHUB_PRIVATE_KEY` / `GITHUB_PRIVATE_KEY_PATH` | (advanced) GitHub App mode |
| `DOCPILOT_CACHE_DIR` | `[cache] dir` |
| `DOCPILOT_NO_CDN` | `prefer_cdn = false` |
| `DOCPILOT_LOG_LEVEL` | `"debug" \| "info" \| "warn" \| "error"` |

## CLI flags

```text
docpilot [options]

  --token <token>          override GITHUB_TOKEN
  --cache-dir <path>       override [cache] dir
  --no-cdn                 set prefer_cdn = false
  --config <path>          explicit .docpilot.toml path
  --log-level <level>      debug | info | warn | error
  --help, -h               show this message
  --version, -v            print version
```
