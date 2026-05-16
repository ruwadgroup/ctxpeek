---
"ctxpeek": patch
---

Patch the dev-dep toolchain: bump `vitest` 2.x → 4.x, refreshing the
transitive `vite` peer (5.4.21 → 8.0.13) and `esbuild` to versions patched
against:

- CVE-2026-39365 — vite path traversal in `.map` handling (≤6.4.1)
- GHSA-67mh-4wv8-2f99 — esbuild dev-server CORS (≤0.24.2)

No runtime changes; published artifact is unaffected. This release exists
to refresh the SBOM and provenance attestation against an audit-clean
dependency tree (`pnpm audit` and `pnpm audit --prod` both report 0
vulnerabilities).
