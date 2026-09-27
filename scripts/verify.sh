#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== pins: README vs actions =="
grep -q "d8073367669608af8fbcc5f63dd0a0d52bb90cff" README.md || { echo "FAIL: README missing v4 SHA"; exit 1; }
grep -rh "upload-sarif@" */action.yml | sort -u | grep -q "d8073367669608af8fbcc5f63dd0a0d52bb90cff # v4" || { echo "FAIL: action SHA drift"; exit 1; }

echo "== parity: opengrep configs =="
for c in "p/security-audit" "p/java" "p/typescript"; do
  grep -q "$c" opengrep/action.yml || { echo "FAIL: action missing $c"; exit 1; }
  grep -q "$c" dagger/src/index.ts || { echo "FAIL: dagger missing $c"; exit 1; }
done

echo "== anatomy: all 6 actions =="
for t in opengrep trivy-fs gitleaks biome zizmor osv-scanner; do
  grep -q 'if: always()' "$t/action.yml" || { echo "FAIL: $t missing if:always"; exit 1; }
  grep -q 'upload-sarif' "$t/action.yml" || { echo "FAIL: $t missing upload"; exit 1; }
  grep -q 'runs":\[\]' "$t/action.yml" || { echo "FAIL: $t missing empty-SARIF fallback"; exit 1; }
done

echo "== dagger typecheck =="
(cd dagger && npm ci --silent && npx tsc --noEmit)

echo "verify green"
