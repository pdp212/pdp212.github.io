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
 * Filters a list of file paths against allowed regex patterns and returns all disallowed paths.
 */
export function checkDisallowedFiles(
  filePaths: string[],
  allowedPatterns: RegExp[]
): string[] {
  const disallowed: string[] = [];
  for (const raw of filePaths) {
    const filePath = raw.trim().replace(/^"/, '').replace(/"$/, '');
    if (!filePath) continue;
    const allowed = allowedPatterns.some((pat) => pat.test(filePath));
    if (!allowed) disallowed.push(filePath);
  }
  return disallowed;
}

/**
 * Scans git status to find explicitly allowed modified, untracked, or deleted files.
 * Strictly filters out any video binaries, ignored files, or disallowed paths.
 */
export async function getStagingCandidates(
  cwd: string,
  allowedPatterns: RegExp[]
): Promise<string[]> {
  const { stdout } = await execAsync('git status --porcelain -uall', { cwd });
  const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
  const candidates: string[] = [];

  for (const line of lines) {
    // Format is XY <path> or XY "<path>"
    const rawPath = line.substring(2).trim().replace(/^"/, '').replace(/"$/, '');
    if (!rawPath) continue;

    // Never consider video binaries as candidates for staging
    if (/\.(mp4|mov|mkv|avi|webm|mxf)$/i.test(rawPath)) {
      continue;
    }

    // Check against allowed patterns
    const isAllowed = allowedPatterns.some((pat) => pat.test(rawPath));
    if (isAllowed) {
      candidates.push(rawPath);
    }
  }

  return candidates;
}

/**
 * Asserts that every file currently in the staged index matches at least one
 * of the provided allow-list patterns. Throws on any disallowed path.
 */
export async function assertOnlyAllowedStagedChanges(
  cwd: string,
  allowedPatterns: RegExp[]
): Promise<void> {
  const { stdout } = await execAsync('git diff --cached --name-status', { cwd });
  const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
  const disallowed: string[] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const status = parts[0]; // e.g. M, A, D, R, etc.
    const filePath = parts[1]?.replace(/^"/, '').replace(/"$/, '');
    if (!filePath) continue;

    // If a video binary is staged for deletion (D), it represents the intentional
    // untracking of legacy binaries to enforce zero-video repository invariants.
    // Staged addition (A) or modification (M) of a video binary is strictly forbidden.
    const isVideo = /\.(mp4|mov|mkv|avi|webm|mxf)$/i.test(filePath);
    if (isVideo && status.startsWith('D')) {
      continue;
    }

    const allowed = allowedPatterns.some((pat) => pat.test(filePath));
    if (!allowed) {
      disallowed.push(filePath);
    }
  }

  if (disallowed.length > 0) {
    throw new Error(
      `Safety gate blocked: disallowed file(s) are staged in Git index:\n  ${disallowed.join('\n  ')}\n` +
        'Only .gitignore, video-pipeline/, and data/work-manifest.json changes are permitted in Phase 07.'
    );
  }
}

/**
 * Safety gate: asserts that modified / staged files match allow-list patterns.
 * Throws on the first disallowed path.
 */
export async function assertOnlyAllowedChanges(
  cwd: string,
  allowedPatterns: RegExp[]
): Promise<void> {
  const { stdout } = await execAsync('git status --porcelain -uall', { cwd });
  const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
  const disallowed: string[] = [];

  for (const line of lines) {
    const status = line.substring(0, 2);
    const rawPath = line.substring(2).trim().replace(/^"/, '').replace(/"$/, '');
    if (!rawPath) continue;

    const isVideo = /\.(mp4|mov|mkv|avi|webm|mxf)$/i.test(rawPath);
    if (isVideo && (status.includes('D') || status === '??')) {
      continue;
    }

    const isAllowed = allowedPatterns.some((pat) => pat.test(rawPath));
    if (!isAllowed) {
      disallowed.push(rawPath);
    }
  }

  if (disallowed.length > 0) {
    throw new Error(
      `Safety gate blocked: disallowed file(s) would be staged:\n  ${disallowed.join('\n  ')}\n` +
        'Only .gitignore, video-pipeline/, and data/work-manifest.json changes are permitted in Phase 07.'
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
