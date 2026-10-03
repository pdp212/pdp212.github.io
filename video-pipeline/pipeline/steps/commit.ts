/**
 * Step 10: Git Atomic Commit
 *
 * Phase 07 – the first and only phase that is permitted to run `git commit`.
 *
 * Safety rules enforced:
 *   - Only .gitignore and video-pipeline/ changes may be staged.
 *   - No .env, credentials, or production video binaries.
 *   - Working tree must be on the `main` branch.
 *   - No force-push at any time (push handled in PushStep).
 *   - Commits only when dry-run is false.
 */

import path from 'node:path';
import type { PipelineStep, StepResult } from './step-interface.js';
import type { PipelineContext } from '../context.js';
import { SecretSanitizer } from '../../core/security/secret-sanitizer.js';
import {
  dryRunGuard,
  execAsync,
  getStagingCandidates,
  assertOnlyAllowedStagedChanges,
  getCurrentBranch,
  getTrackedVideoFiles,
} from './_utils.js';

/** Files and directories allowed to appear in the staged diff for Phase 07. */
export const ALLOWED_CHANGE_PATTERNS: RegExp[] = [
  /^\.gitignore$/,
  /^video-pipeline\//,
  /^data\/work-manifest\.json$/,
];

/** Commit message mandated by promt 07. */
const COMMIT_MSG = 'feat(video-pipeline): automate video delivery to R2';

export class CommitStep implements PipelineStep {
  public readonly stage = 'COMMITTING' as const;
  public readonly name = 'Git Atomic Commit';

  public async execute(context: PipelineContext): Promise<StepResult> {
    context.logger.info(this.stage, 'START', 'Running Phase 07 pre-commit safety audit...');

    // 1. Dry-run guard
    const early = dryRunGuard(this.stage, context, 'Git commit skipped.');
    if (early) return early;

    try {
      const portfolioRoot = path.resolve(process.cwd(), context.config.portfolioPath || '../');

      // 2. Branch guard – must be on `main` (or configured git branch)
      const branch = await getCurrentBranch(portfolioRoot);
      if (branch !== context.config.git.branch) {
        throw new Error(
          `Commit blocked: current branch is '${branch}', expected '${context.config.git.branch}'.`
        );
      }
      context.logger.info(this.stage, 'BRANCH_OK', `On branch '${branch}'.`);

      // 3. Zero production videos tracked in Git index
      const trackedVideos = await getTrackedVideoFiles(portfolioRoot, /assets\/videos\/projects\/|\.(mp4|mov|mkv|avi|webm|mxf)$/i);
      if (trackedVideos.length > 0) {
        throw new Error(
          `Commit blocked: production video(s) still tracked by Git:\n  ${trackedVideos.join('\n  ')}`
        );
      }
      context.logger.info(this.stage, 'NO_TRACKED_VIDEOS', 'Zero production videos in Git index.');

      // 4. Discover candidate staging files based on allow-list
      const candidates = await getStagingCandidates(portfolioRoot, ALLOWED_CHANGE_PATTERNS);

      // 5. Stage only allowed explicit candidate files
      if (candidates.length > 0) {
        const stageArgs = candidates.map((c) => `"${c}"`).join(' ');
        await execAsync(`git add -- ${stageArgs}`, { cwd: portfolioRoot });
        context.logger.info(
          this.stage,
          'STAGED',
          `Staged ${candidates.length} permitted file(s):\n  ${candidates.join('\n  ')}`
        );
      }

      // 6. Assert that all staged changes strictly conform to allow-list
      await assertOnlyAllowedStagedChanges(portfolioRoot, ALLOWED_CHANGE_PATTERNS);
      context.logger.info(this.stage, 'STAGED_FILES_OK', 'Only permitted files are staged.');

      // 7. Inspect staged diff for credentials and secret leaks
      const { stdout: stagedDiff } = await execAsync('git diff --cached', { cwd: portfolioRoot });
      const secretViolations = SecretSanitizer.scanDiffForSecrets(stagedDiff);
      if (secretViolations.length > 0) {
        throw new Error(
          `Commit blocked: sensitive credentials detected in staged diff:\n  ${secretViolations.join('\n  ')}`
        );
      }

      // 8. Idempotency Check: Are there changes staged to commit?
      const { stdout: stagedFiles } = await execAsync('git diff --cached --name-only', { cwd: portfolioRoot });
      if (!stagedFiles.trim()) {
        const { stdout: sha } = await execAsync('git rev-parse HEAD', { cwd: portfolioRoot });
        context.gitCommitSha = sha.trim();

        context.logger.info(this.stage, 'NO_CHANGES', `Working tree is clean. HEAD commit: ${context.gitCommitSha}`);
        context.logger.info(this.stage, 'SUMMARY', `COMMIT SHA: ${context.gitCommitSha}\nBRANCH: ${branch}\nGIT STATUS: clean (nothing to commit)\nCOMMIT SUCCESS\nPUSH: NOT PERFORMED`);

        return {
          success: true,
          stage: this.stage,
          message: `Commit step clean: nothing to commit at ${context.gitCommitSha}`,
        };
      }

      // 9. Determine commit message
      let commitMsg = context.commitMessage;
      if (!commitMsg) {
        if (context.items && context.items.length > 0) {
          const names = context.items.map((i) => i.filename || i.id).join(', ');
          commitMsg = `feat(video-pipeline): deliver ${context.items.length} video(s) to R2 (${names})`;
        } else if (stagedFiles.includes('data/work-manifest.json')) {
          commitMsg = 'feat(video-pipeline): update work-manifest with delivered videos';
        } else {
          commitMsg = COMMIT_MSG;
        }
      }

      // 10. Execute commit
      await execAsync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd: portfolioRoot });

      // 11. Capture commit SHA & git status
      const { stdout: sha } = await execAsync('git rev-parse HEAD', { cwd: portfolioRoot });
      context.gitCommitSha = sha.trim();

      const { stdout: status } = await execAsync('git status --short', { cwd: portfolioRoot });

      context.logger.info(
        this.stage,
        'COMMITTED',
        `Commit ${context.gitCommitSha}: ${commitMsg}`,
        'SUCCESS'
      );
      context.logger.info(
        this.stage,
        'AUDIT_SUMMARY',
        `COMMIT SHA: ${context.gitCommitSha}\nCOMMIT MESSAGE: ${commitMsg}\nBRANCH: ${branch}\nGIT STATUS: ${status.trim() || 'clean'}\nCOMMIT SUCCESS\nPUSH: NOT PERFORMED`
      );

      return {
        success: true,
        stage: this.stage,
        message: `Commit successful: ${context.gitCommitSha}`,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      context.logger.error(this.stage, 'COMMIT_FAILED', error.message);
      return { success: false, stage: this.stage, error, message: error.message };
    }
  }
}
