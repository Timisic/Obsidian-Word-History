import * as fs from "fs";
import * as path from "path";
import { commandText, gitText } from "./git";
import type { PreflightCheck, PreflightResult } from "./types";

function pass(key: string, label: string, detail: string): PreflightCheck {
  return { key, label, ok: true, detail };
}

function fail(key: string, label: string, detail: string): PreflightCheck {
  return { key, label, ok: false, detail };
}

export async function runPreflight(vaultPath: string, outputPath: string): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];
  let headCommit = "";

  checks.push(fs.existsSync(vaultPath) ? pass("desktop", "Local desktop vault", vaultPath) : fail("desktop", "Local desktop vault", "Vault path is not accessible."));

  try {
    const version = (await commandText("git", ["--version"])).trim();
    checks.push(pass("git", "System git", version));
  } catch (_error) {
    checks.push(fail("git", "System git", "Install git and make sure it is available on PATH."));
  }

  try {
    const inside = (await gitText(vaultPath, ["rev-parse", "--is-inside-work-tree"])).trim();
    checks.push(inside === "true" ? pass("repo", "Vault is a Git repository", vaultPath) : fail("repo", "Vault is a Git repository", "Run git init and commit your vault first."));
  } catch (_error) {
    checks.push(fail("repo", "Vault is a Git repository", "This vault is not a Git repo yet. Run git init, add files, and create at least one commit."));
  }

  try {
    headCommit = (await gitText(vaultPath, ["rev-parse", "HEAD"])).trim();
    checks.push(pass("head", "At least one commit", headCommit.slice(0, 12)));
  } catch (_error) {
    checks.push(fail("head", "At least one commit", "No commit found. Commit your current notes before generating history."));
  }

  try {
    const outputDirectory = path.dirname(outputPath);
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.accessSync(outputDirectory, fs.constants.W_OK);
    if (fs.existsSync(outputPath)) fs.accessSync(outputPath, fs.constants.W_OK);
    checks.push(pass("output", "Output path writable", outputPath));
  } catch (error) {
    checks.push(fail("output", "Output path writable", `Cannot write to ${outputPath}: ${error instanceof Error ? error.message : String(error)}`));
  }

  return { ok: checks.every((check) => check.ok), checks, headCommit };
}

export function summarizePreflightFailure(result: PreflightResult): string {
  const firstFailure = result.checks.find((check) => !check.ok);
  return firstFailure ? `${firstFailure.label}: ${firstFailure.detail}` : "Unknown preflight failure.";
}
