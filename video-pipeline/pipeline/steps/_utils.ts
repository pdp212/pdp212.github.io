/**
 * Shared Pipeline Step Utilities
 * Centralises exec wrapper, dry-run guard, and staged-file safety verification.
 * All step modules should import from here instead of repeating these patterns.
 */

import { exec } from 'node:child_process';
import type { PipelineContext } from '../context.js';
import type { StepResult } from './step-interface.js';
import type { PipelineStage } from '../../core/errors/pipeline-errors.js';

// ---------------------------------------------------------------------------
// Exec wrapper
// ---------------------------------------------------------------------------

export interface ExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Promisified exec that returns stdout/stderr and throws on non-zero exit.
 * All external commands inside steps should use this helper.
 */
export function execAsync(
  command: string,
  options: { cwd?: string; timeout?: number } = {}
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    exec(command, { ...options }, (error, stdout, stderr) => {
      if (error) {
        // Attach stdout/stderr to the error for richer diagnostics
        const enriched = new Error(
          `Command failed: ${command}\n${stderr || stdout || error.message}`
        );
        reject(enriched);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Dry-run guard
// ---------------------------------------------------------------------------

/**
 * Returns a successful StepResult early when the pipeline is running in
 * dry-run mode.  Steps should call this first and return immediately if the
 * result is non-null.
 *
 * @example
 * const early = dryRunGuard(this.stage, context, 'Commit skipped.');
 * if (early) return early;
 */
export function dryRunGuard(
  stage: PipelineStage,
  context: PipelineContext,
  message: string
): StepResult | null {
  if (!context.isDryRun) return null;
  context.logger.info(stage, 'DRY_RUN', `[DryRun] ${message}`, 'SUCCESS');
  return { success: true, stage, message: `[DryRun] ${message}` };
}

// ---------------------------------------------------------------------------
// Staged-file safety verifier
// ---------------------------------------------------------------------------

/**
 * Safety gate: asserts that every modified / staged file matches at least one
 * of the provided allow-list patterns.  Throws on the first disallowed path.
 * Should be called before any `git add` or `git commit`.
 */
export async function assertOnlyAllowedChanges(
  cwd: string,
  allowedPatterns: RegExp[]
): Promise<void> {
  const { stdout } = await execAsync('git status --short', { cwd });
  const disallowed: string[] = [];

  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // Format: "XY path" – strip the two-char status prefix plus whitespace
    const filePath = line.slice(2).trim().replace(/^"/, '').replace(/"$/, '');
    const allowed = allowedPatterns.some((pat) => pat.test(filePath));
    if (!allowed) disallowed.push(filePath);
  }

  if (disallowed.length > 0) {
    throw new Error(
      `Safety gate blocked: disallowed file(s) would be staged:\n  ${disallowed.join('\n  ')}\n` +
        'Only .gitignore and video-pipeline/ changes are permitted in Phase 07.'
    );
  }
}

// ---------------------------------------------------------------------------
// Pre-commit audit helpers
// ---------------------------------------------------------------------------

/**
 * Returns the current git branch name.
 */
export async function getCurrentBranch(cwd: string): Promise<string> {
  const { stdout } = await execAsync('git branch --show-current', { cwd });
  return stdout.trim();
}

/**
 * Returns the list of files currently tracked in git that match the given
 * extension regex.  Used to assert zero production videos remain tracked.
 */
export async function getTrackedVideoFiles(
  cwd: string,
  pattern: RegExp = /\.(mp4|mov|mkv|avi|webm)$/i
): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git ls-files', { cwd });
    return stdout.split('\n').filter((f) => f.trim() && pattern.test(f.trim()));
  } catch {
    // git ls-files exits 1 when no files match – treat as empty list
    return [];
  }
}
