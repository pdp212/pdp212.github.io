/**
 * Step 7: Git Working Tree Cleanup & Fallback Removal
 * Removes legacy project video files from Git tracking and local disk fallback.
 * Strictly preserves UI transition videos under assets/transitions/*.
 */

import path from 'node:path';
import type { PipelineStep, StepResult } from './step-interface.js';
import type { PipelineContext } from '../context.js';
import { StandardGitClient, GitCleanupService } from '../../engines/git/index.js';
import { GitSafetyError } from '../../core/errors/pipeline-errors.js';

export class CleanupGitStep implements PipelineStep {
  public readonly stage = 'CLEANING_GIT' as const;
  public readonly name = 'Git Cleanup & Fallback Removal';

  public async execute(context: PipelineContext): Promise<StepResult> {
    context.logger.info(this.stage, 'START', 'Checking Git tree for legacy project video binaries...');

    try {
      const portfolioRoot = path.resolve(process.cwd(), context.config.portfolioPath || '../');
      const gitClient = new StandardGitClient(portfolioRoot);
      const cleanupService = new GitCleanupService(gitClient);

      // Perform cleanup / dry-run check
      const result = await cleanupService.removeTrackedBinaries(
        portfolioRoot,
        context.isDryRun,
        portfolioRoot
      );

      if (context.isDryRun) {
        if (result.untrackedCount > 0 || result.removedLocalCount > 0) {
          context.logger.info(
            this.stage,
            'DRY_RUN',
            `[DryRun] Would untrack ${result.untrackedCount} file(s) and remove ${result.removedLocalCount} local fallback(s).`,
            'SUCCESS'
          );
        } else {
          context.logger.info(
            this.stage,
            'DRY_RUN',
            '[DryRun] Git tree is already clean: zero project videos tracked or present.',
            'SUCCESS'
          );
        }
        return {
          success: true,
          stage: this.stage,
          message: `[DryRun] Git cleanup preview verified (${result.untrackedCount} tracked, ${result.removedLocalCount} local).`,
        };
      }

      // Verification: double-check that no project videos remain tracked
      const remainingTracked = await cleanupService.findTrackedProjectVideos(portfolioRoot);
      if (remainingTracked.length > 0) {
        throw new GitSafetyError(
          `Cleanup failed: project videos remain tracked in Git: ${remainingTracked.join(', ')}`
        );
      }

      context.logger.info(
        this.stage,
        'CLEANUP_SUCCESS',
        `Git cleanup complete. Untracked: ${result.untrackedCount}, Removed local: ${result.removedLocalCount}.`,
        'SUCCESS'
      );

      return {
        success: true,
        stage: this.stage,
        message: `Git cleanup verified: zero project videos tracked in repository (${result.untrackedCount} untracked).`,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      context.logger.error(this.stage, 'CLEANUP_FAILED', error.message);
      return {
        success: false,
        stage: this.stage,
        error,
        message: error.message,
      };
    }
  }
}
