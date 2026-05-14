#!/usr/bin/env python3
"""Validate that every relative markdown link in docs/ resolves.

Used by .github/workflows/ci.yml as a docs guardrail.

Usage:
    python scripts/check_links.py [--root docs]
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")


def collect_relative_links(md: Path) -> list[str]:
    text = md.read_text(encoding="utf-8")
    out: list[str] = []
    for match in LINK_RE.finditer(text):
        target = match.group(1).split("#", 1)[0]
        if not target:
            continue
        if target.startswith(("http://", "https://", "mailto:")):
            continue
        out.append(target)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default="docs", help="Directory to scan")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"error: {root} is not a directory", file=sys.stderr)
        return 2

    failures: list[tuple[Path, str]] = []
    for md in root.rglob("*.md"):
        for target in collect_relative_links(md):
            resolved = (md.parent / target).resolve()
            if not resolved.exists():
                failures.append((md, target))

    if failures:
        print(f"broken links: {len(failures)}", file=sys.stderr)
        for md, target in failures:
            print(f"  {md.relative_to(root.parent)}: {target}", file=sys.stderr)
        return 1

    print(f"ok: scanned {root}, all relative links resolve")
    return 0


if __name__ == "__main__":
    sys.exit(main())
