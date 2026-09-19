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
scanning via `github/codeql-action/upload-sarif`.

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
`opengrep/opengrep:latest`, `zricethezav/gitleaks:latest`.

## License

Apache-2.0 — see [LICENSE](LICENSE).
