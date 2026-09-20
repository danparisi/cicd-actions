# AGENTS.md

Library of pluggable GitHub composite actions + Dagger module for local parity. Consumers pin `@v1`. No app code, no test suite, no workflows in this repo.

## Layout

- `<tool>/action.yml` — one composite action each: `opengrep/`, `trivy-fs/`, `gitleaks/`, `biome/`, `zizmor/`, `osv-scanner/`
- `dagger/` — Dagger TS-SDK module (`src/index.ts`): `backendTest`, `frontendTest`, `lint`, `ci`

## Composite action anatomy (all 6 follow it)

`mkdir reports/sarif` → run tool → empty-SARIF fallback (`{"version":"2.1.0","runs":[]}` if file missing) → `upload-sarif` with `if: always()` and unique `category`.
Standard inputs: `version`, `fail-on` (`'true'`/`'false'`), `output` (default `reports/sarif/<tool>.sarif`).

`fail-on` defaults (contract — never change silently, `description` states it):
- Blocking `'true'`: `trivy-fs` (HIGH,CRITICAL), `gitleaks`
- Warn-only `'false'`: `opengrep`, `biome`, `zizmor`, `osv-scanner`

## Pinning rules

- No `latest`/floating tags. Third-party actions pinned to full commit SHA with version in trailing comment (Dependabot updates SHAs). `trivy-action@0.24.0` stays as-is (already pinned).
- Tool versions are `version` inputs with defaults; containers pinned by immutable tag (not digest — digests are arch-specific; resolve via `docker buildx imagetools inspect <ref>` when promoting).
- Current pins live in `README.md` "Pinned versions" + `dagger/src/index.ts` constants — update both when bumping.

## Dagger module

- `dagger.json` engine `v0.21.9`; requires Dagger CLI 0.21+ + Docker daemon for runs.
- First `dagger develop` in `dagger/` (generates gitignored `sdk/` bindings; `call` fails at load without it). Typecheck needs no engine/Docker (`node_modules/` not vendored): `npm ci && npx tsc --noEmit`.
- Local runs: `cd dagger && dagger call lint --source /path/to/app` (<15s) or `dagger call ci --source /path/to/app` (prints `ci green`).
- Gotchas: `frontendTest` + Biome step mount `source.directory("frontend")` and fail without `frontend/` (pnpm + Vitest assumed); `backendTest` needs `pom.xml` at source root (`mvn -B generate-sources` then `test`); `lint()` is blocking but its SARIF is container-scoped (`/tmp/opengrep.sarif`) and never uploaded — upload happens only in composite actions.

## Add a tool / release

1. New `<tool>/action.yml` following anatomy above (new `category`, `version`/`fail-on`/`output` inputs).
2. Add catalog + pin rows in `README.md` (and Dagger constant if used in `lint()`).
3. Move `v1` tag guardrail-friendly (no `--force`):
   `git tag -f v1 && git push origin :refs/tags/v1 && git push origin v1`
