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
import {
  dryRunGuard,
  execAsync,
  assertOnlyAllowedChanges,
  getCurrentBranch,
  getTrackedVideoFiles,
} from './_utils.js';

/** Files and directories allowed to appear in the staged diff for Phase 07. */
const ALLOWED_CHANGE_PATTERNS: RegExp[] = [
  /^\.gitignore$/,
  /^video-pipeline\//,
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

      // 2. Branch guard – must be on `main`
      const branch = await getCurrentBranch(portfolioRoot);
      if (branch !== context.config.git.branch) {
        throw new Error(
          `Commit blocked: current branch is '${branch}', expected '${context.config.git.branch}'.`
        );
      }
      context.logger.info(this.stage, 'BRANCH_OK', `On branch '${branch}'.`);

      // 3. No production videos tracked
      const trackedVideos = await getTrackedVideoFiles(portfolioRoot, /assets\/videos\/projects\//);
      if (trackedVideos.length > 0) {
        throw new Error(
          `Commit blocked: production video(s) still tracked by Git:\n  ${trackedVideos.join('\n  ')}`
        );
      }
      context.logger.info(this.stage, 'NO_TRACKED_VIDEOS', 'Zero production videos in Git index.');

      // 4. Assert only allowed files are changed
      await assertOnlyAllowedChanges(portfolioRoot, ALLOWED_CHANGE_PATTERNS);
      context.logger.info(this.stage, 'STAGED_FILES_OK', 'Only permitted files are modified.');

      // 5. Stage the allowed paths
      await execAsync('git add .gitignore video-pipeline', { cwd: portfolioRoot });
      context.logger.info(this.stage, 'STAGED', 'Staged .gitignore and video-pipeline/.');

      // 6. Execute commit
      await execAsync(`git commit -m "${COMMIT_MSG}"`, { cwd: portfolioRoot });

      // 7. Capture commit SHA for downstream steps
      const { stdout: sha } = await execAsync('git rev-parse HEAD', { cwd: portfolioRoot });
      context.gitCommitSha = sha.trim();

      context.logger.info(
        this.stage,
        'COMMITTED',
        `Commit ${context.gitCommitSha}: ${COMMIT_MSG}`,
        'SUCCESS'
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
