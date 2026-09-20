import { dag, Directory, func, object } from "@dagger.io/dagger"

/**
 * Pinned tool versions (immutable tags; resolve to digests for full
 * supply-chain pinning, e.g. `docker buildx imagetools inspect <ref>`):
 * - opengrep v1.27.1 (latest stable as of 2026-09-18; musl binary from
 *   GitHub Releases — no official opengrep container image exists)
 * - gitleaks v8.30.1 (latest stable as of 2026-09-18)
 * - @biomejs/biome 2.5.12 (latest 2.x as of 2026-09-18)
 * Keep aquasecurity/trivy-action@0.24.0 as is (already pinned).
 */
const OPENGREP_VERSION = "1.27.1"
const OPENGREP_MUSL_URL = `https://github.com/opengrep/opengrep/releases/download/v${OPENGREP_VERSION}/opengrep_musllinux_x86`
const GITLEAKS_IMAGE = "zricethezav/gitleaks:v8.30.1"
const NODE_IMAGE = "node:24-alpine"
const BIOME_PACKAGE = "@biomejs/biome@2.5.12"

/**
 * App-agnostic CI pipeline.
 *
 * Intended usage from any app repo (local parity with GitHub workflows):
 *
 *   dagger -m github.com/danparisi/cicd-actions/dagger@v1 call ci --source .
 *
 * Or from a checkout of this repo:
 *
 *   cd dagger && dagger call ci --source /path/to/app
 *
 * NOTE: lint() findings fail the call (blocking), matching the
 * warn-only vs blocking contract documented in the repo README — except
 * the SARIF produced inside lint() containers is container-scoped and is
 * NOT uploaded anywhere on local runs (intended; upload happens only in
 * the GitHub composite actions via upload-sarif).
 */
@object()
export class Cicd {
  /**
   * Java backend: regenerate sources then run the full test suite.
   * Expects a Maven project at the source root (pom.xml).
   */
  @func()
  async backendTest(source: Directory): Promise<string> {
    return dag
      .container()
      .from("maven:3.9-eclipse-temurin-25")
      .withMountedDirectory("/app", source)
      .withMountedCache("/root/.m2", dag.cacheVolume("m2"))
      .withWorkdir("/app")
      .withExec(["mvn", "-B", "generate-sources"])
      .withExec(["mvn", "-B", "test", "-DskipTests=false"])
      .stdout()
  }

  /**
   * Node frontend: install, codegen, typecheck, build, unit tests.
   * Expects the app under `frontend/` (pnpm, Vitest).
   */
  @func()
  async frontendTest(source: Directory): Promise<string> {
    return dag
      .container()
      .from(NODE_IMAGE)
      .withExec(["corepack", "enable"])
      .withMountedDirectory("/app/frontend", source.directory("frontend"))
      .withWorkdir("/app/frontend")
      .withMountedCache("/root/.local/share/pnpm/store", dag.cacheVolume("pnpm"))
      .withExec(["pnpm", "install", "--frozen-lockfile"])
      .withExec(["pnpm", "run", "generate"])
      .withExec(["pnpm", "exec", "tsc", "--noEmit"])
      .withExec(["pnpm", "run", "build"])
      .withExec(["pnpm", "run", "test:run"])
      .stdout()
  }

  /**
   * Fast static analysis (<15s target for pre-push): Opengrep + Gitleaks,
   * then Biome on `frontend/`. Fails the call on tool findings.
   */
  @func()
  async lint(source: Directory): Promise<string> {
    // Opengrep SAST (musl release binary on alpine — no official
    // opengrep image exists; SARIF out)
    await dag
      .container()
      .from(NODE_IMAGE)
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
      .withExec(["wget", "-O", "/usr/local/bin/opengrep", OPENGREP_MUSL_URL])
      .withExec(["chmod", "+x", "/usr/local/bin/opengrep"])
      .withExec([
        "opengrep",
        "scan",
        "--config",
        "p/security-audit",
        "--sarif",
        "--output",
        "/tmp/opengrep.sarif",
      ])
      .sync()

    // Gitleaks secret scan (fails on leaked secrets)
    await dag
      .container()
      .from(GITLEAKS_IMAGE)
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
      .withExec(["gitleaks", "detect", "--source", ".", "--no-git", "--redact"])
      .sync()

    // Biome lint/format check on the frontend
    return dag
      .container()
      .from(NODE_IMAGE)
      .withMountedDirectory("/app/frontend", source.directory("frontend"))
      .withWorkdir("/app/frontend")
      .withExec(["npx", "--yes", BIOME_PACKAGE, "ci", "."])
      .stdout()
  }

  /**
   * Full local gate: backend + frontend + lint. Returns "ci green".
   */
  @func()
  async ci(source: Directory): Promise<string> {
    await this.backendTest(source)
    await this.frontendTest(source)
    await this.lint(source)
    return "ci green"
  }
}
