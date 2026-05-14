# scripts/

Repo-internal Python helpers (release prep, doc generation, fixture
synthesis). Linted and formatted with `ruff` (configured in
`../ruff.toml`).

To add one:

1. Drop a `name.py` here with a `#!/usr/bin/env python3` shebang.
2. Run `ruff check . && ruff format .`.
3. Wire it from a Makefile target or a CI step if you want it automated.
