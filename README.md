# cicd-actions

App-agnostic pluggable CI actions + Dagger module for local parity.

## Composite actions (use as `danparisi/cicd-actions/<name>@v1`)

| Action | What it does | Default SARIF |
|---|---|---|
| `opengrep` | Opengrep SAST (`p/security-audit`, `p/java`, `p/typescript`) | `reports/sarif/opengrep.sarif` |
| `trivy-fs` | Trivy filesystem scan (`HIGH,CRITICAL`) | `reports/sarif/trivy-fs.sarif` |
| `gitleaks` | Secret detection via `gitleaks-action` | `reports/sarif/gitleaks.sarif` |
| `biome` | `biome ci` on `frontend/` | `reports/sarif/biome.sarif` |
| `zizmor` | GitHub Actions workflow audit | `reports/sarif/zizmor.sarif` |
| `osv-scanner` | Dependency vulnerability scan (recursive) | `reports/sarif/osv-scanner.sarif` |

Every action accepts an `output` input (SARIF path) and uploads to code
scanning via `github/codeql-action/upload-sarif` (SHA-pinned, see below).

## Warn-only vs blocking (`fail-on`)

Every action accepts a `fail-on` input (`'true'` / `'false'`):

| Default | Actions | Meaning |
|---|---|---|
| Blocking (`fail-on: 'true'`) | `trivy-fs`, `gitleaks` | Fast-gate: findings fail the workflow (HIGH/CRITICAL vulns, leaked secrets). Set `fail-on: 'false'` to make them informational. |
| Warn-only (`fail-on: 'false'`) | `opengrep`, `biome`, `zizmor`, `osv-scanner` | Findings never fail the workflow; SARIF is still uploaded to code scanning. Set `fail-on: 'true'` to block on findings. |

Blocking behavior is never changed silently: each action's `description`
states its default, and this table is the contract. SARIF upload always
runs (`if: always()`), even when the scan step fails.

## Pinned versions

No `latest` or floating major tags for tools. Third-party actions are
pinned to full commit SHAs (with the version noted in a trailing
comment — keep updated via Dependabot):

| Tool | Pin | As of |
|---|---|---|
| `github/codeql-action/upload-sarif` | `3ea06614dafe36dec890db3446326e0d40ce53d4` (`# v3`) | 2026-09-18 |
| `gitleaks/gitleaks-action` | `ff98106e4c7b2bc287b24eaf42907196329070c7` (`# v2`) | 2025-04-17 |
| `aquasecurity/trivy-action` | `@0.24.0` (already pinned, kept as is) | — |
| `opengrep` (pip, `opengrep` action) | `version` input, default `1.27.1` | 2026-09-18 |
| `zizmor` (pip, `zizmor` action) | `version` input, default `1.30.1` | 2026-09-18 |
| `@biomejs/biome` (npx, `biome` action) | `version` input, default `2.5.12` | 2026-09-18 |
| `osv-scanner` (binary, `osv-scanner` action) | `version` input, default `2.2.4` | pre-existing |
| Dagger `opengrep` image | `opengrep/opengrep:v1.27.1` | 2026-09-18 |
| Dagger `gitleaks` image | `zricethezav/gitleaks:v8.30.1` | 2026-09-18 |
| Dagger `biome` package | `@biomejs/biome@2.5.12` | 2026-09-18 |

Container image digests are intentionally pinned by immutable version tag
rather than digest (digests are arch-specific). To resolve a digest, run
`docker buildx imagetools inspect <ref>` and record it when promoting a
new version.

## Dagger module (`dagger/`)

Local parity with CI: `backendTest`, `frontendTest`, `lint`, `ci`.

Requires Dagger 0.21+ and a running Docker daemon.

```bash
# from an app repo, using the published module:
dagger -m github.com/danparisi/cicd-actions/dagger@v1 call ci --source .

# from a checkout of this repo:
cd dagger
dagger call lint --source /path/to/app
dagger call ci --source /path/to/app   # prints "ci green"
```

Containers: `maven:3.9-eclipse-temurin-25`, `node:24-alpine`,
`opengrep/opengrep:v1.27.1`, `zricethezav/gitleaks:v8.30.1`.

Note: `lint()` findings fail the call (blocking), but the SARIF it writes
is container-scoped (`/tmp/opengrep.sarif` inside the Opengrep container)
and is NOT uploaded anywhere on local runs — that is intended. SARIF
upload to code scanning happens only in the GitHub composite actions.

## App-agnostic limits

- `frontend/` is a hard requirement: `frontendTest` and the Biome step of
  `lint()` mount `source.directory("frontend")` and fail if the consuming
  repo has no `frontend/` directory (pnpm + Vitest assumed).
- `backendTest` requires a Maven project (`pom.xml`) at the source root.
- No engine is needed to validate the module's TypeScript: `npx tsc --noEmit`
  in `dagger/` typechecks without the Dagger engine or Docker.

## License

Apache-2.0 — see [LICENSE](LICENSE).
