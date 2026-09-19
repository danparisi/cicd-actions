import { dag, Directory, func, object } from "@dagger.io/dagger"

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
      .from("node:24-alpine")
      .withExec(["corepack", "enable", "pnpm"])
      .withMountedDirectory("/app/frontend", source.directory("frontend"))
      .withWorkdir("/app/frontend")
      .withMountedCache("/root/.local/share/pnpm/store", dag.cacheVolume("pnpm"))
      .withExec(["pnpm", "install", "--frozen-lockfile"])
      .withExec(["pnpm", "run", "generate"])
      .withExec(["pnpm", "exec", "tsc", "-b", "--noEmit"])
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
    // Opengrep SAST (security-audit ruleset, SARIF out)
    await dag
      .container()
      .from("opengrep/opengrep:latest")
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
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
      .from("zricethezav/gitleaks:latest")
      .withMountedDirectory("/src", source)
      .withWorkdir("/src")
      .withExec(["gitleaks", "detect", "--source", ".", "--no-git", "--redact"])
      .sync()

    // Biome lint/format check on the frontend
    return dag
      .container()
      .from("node:24-alpine")
      .withMountedDirectory("/app/frontend", source.directory("frontend"))
      .withWorkdir("/app/frontend")
      .withExec(["npx", "@biomejs/biome", "ci", "."])
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
