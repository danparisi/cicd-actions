#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== pins: README vs actions =="
grep -q "d8073367669608af8fbcc5f63dd0a0d52bb90cff" README.md || { echo "FAIL: README missing v4 SHA"; exit 1; }
grep -rh "upload-sarif@" */action.yml | sort -u | grep -q "d8073367669608af8fbcc5f63dd0a0d52bb90cff # v4" || { echo "FAIL: action SHA drift"; exit 1; }
grep -q "aquasecurity/trivy-action@v0.24.0" trivy-fs/action.yml || { echo "FAIL: trivy-action pin drift"; exit 1; }

echo "== pins: dagger constants vs action defaults =="
action_default() { sed -n '/^  version:/,/default:/p' "$1" | grep -o 'default: [^ ]*' | awk '{print $2}'; }
opengrep_ver=$(grep -o 'OPENGREP_VERSION = "[^"]*"' dagger/src/index.ts | cut -d'"' -f2)
[ "$opengrep_ver" = "$(action_default opengrep/action.yml)" ] || { echo "FAIL: opengrep dagger=$opengrep_ver action=$(action_default opengrep/action.yml)"; exit 1; }
gitleaks_ver=$(grep -o 'GITLEAKS_IMAGE = "[^"]*"' dagger/src/index.ts | cut -d'"' -f2 | cut -d: -f2 | sed 's/^v//')
[ "$gitleaks_ver" = "$(action_default gitleaks/action.yml)" ] || { echo "FAIL: gitleaks dagger=$gitleaks_ver action=$(action_default gitleaks/action.yml)"; exit 1; }
# Dagger lint() runs repo-owned eslint, not biome (biome/action.yml stays
# warn-only composite; dagger pins no biome version by design).
grep -q 'BIOME_PACKAGE' dagger/src/index.ts && { echo "FAIL: dagger must not pin biome"; exit 1; }
grep -q '"pnpm", "run", "lint"' dagger/src/index.ts || { echo "FAIL: dagger lint() missing repo-owned eslint step"; exit 1; }

echo "== parity: opengrep configs =="
for c in "p/security-audit" "p/java" "p/typescript"; do
  grep -q "$c" opengrep/action.yml || { echo "FAIL: action missing $c"; exit 1; }
  grep -q "$c" dagger/src/index.ts || { echo "FAIL: dagger missing $c"; exit 1; }
done

echo "== parity: opengrep excludes =="
ts_excludes=$(sed -n '/^const OPENGREP_EXCLUDES =$/,+1p' dagger/src/index.ts | grep -o '"[^"]*"' | tr -d '"')
act_excludes=$(grep -o 'excludes="[^"]*"' opengrep/action.yml | cut -d'"' -f2)
[ -n "$ts_excludes" ] || { echo "FAIL: dagger OPENGREP_EXCLUDES not found"; exit 1; }
[ "$ts_excludes" = "$act_excludes" ] || { echo "FAIL: opengrep exclude lists drifted (dagger vs action)"; exit 1; }
grep -q '"--exclude"' dagger/src/index.ts || { echo "FAIL: dagger lint() does not pass --exclude"; exit 1; }
grep -q 'exclude_args' opengrep/action.yml || { echo "FAIL: opengrep action does not pass --exclude"; exit 1; }

echo "== anatomy: all 6 actions =="
for t in opengrep trivy-fs gitleaks biome zizmor osv-scanner; do
  grep -q 'mkdir -p "$(dirname' "$t/action.yml" || { echo "FAIL: $t missing mkdir reports/sarif"; exit 1; }
  grep -q 'if: always()' "$t/action.yml" || { echo "FAIL: $t missing if:always"; exit 1; }
  grep -q 'upload-sarif' "$t/action.yml" || { echo "FAIL: $t missing upload"; exit 1; }
  grep -q "category: $t" "$t/action.yml" || { echo "FAIL: $t missing unique category"; exit 1; }
  grep -Fq '{"version":"2.1.0","runs":[]}' "$t/action.yml" || { echo "FAIL: $t missing empty-SARIF fallback"; exit 1; }
done

echo "== installs: per-job temp dirs =="
for t in opengrep gitleaks osv-scanner; do
  grep -q 'RUNNER_TEMP' "$t/action.yml" || { echo "FAIL: $t missing RUNNER_TEMP install dir"; exit 1; }
done

echo "== dagger typecheck =="
(cd dagger && npm ci --silent && npx tsc --noEmit)

echo "verify green"
