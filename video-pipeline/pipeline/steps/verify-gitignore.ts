/**
 * Step 8: Git Safety & .gitignore Verification
 * Confirms that assets/videos/projects/*.mp4 and secret files remain strictly ignored,
 * while verifying that UI transition videos remain intact.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { PipelineStep, StepResult } from './step-interface.js';
import type { PipelineContext } from '../context.js';
import {
  StandardGitClient,
  GitStatusChecker,
  GitSafetyEngine,
} from '../../engines/git/index.js';
import { GitSafetyError } from '../../core/errors/pipeline-errors.js';

export class VerifyGitignoreStep implements PipelineStep {
  public readonly stage = 'VERIFYING_GIT' as const;
  public readonly name = 'Git Safety & Ignore Verification';

  public async execute(context: PipelineContext): Promise<StepResult> {
    context.logger.info(this.stage, 'START', 'Verifying Git safety rules and .gitignore patterns...');

    try {
      const portfolioRoot = path.resolve(process.cwd(), context.config.portfolioPath || '../');
      const gitignorePath = path.resolve(portfolioRoot, '.gitignore');

      if (!fs.existsSync(gitignorePath)) {
        throw new GitSafetyError(`Root .gitignore file missing at: ${gitignorePath}`);
      }

      // 1. Audit .gitignore rules
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      GitSafetyEngine.assertGitignoreRules(gitignoreContent);

      // 2. Audit tracked files
      const gitClient = new StandardGitClient(portfolioRoot);
      const statusChecker = new GitStatusChecker(gitClient);
      const trackedFiles = await statusChecker.getTrackedFiles(undefined, portfolioRoot);

      // Asserts zero secrets tracked (.env)
      GitSafetyEngine.assertNoTrackedSecrets(trackedFiles);

      // Asserts zero production video binaries tracked (assets/videos/projects/*.mp4 & assets/transitions/*.mp4)
      GitSafetyEngine.assertNoTrackedProjectVideos(trackedFiles);

      context.logger.info(
        this.stage,
        'SAFETY_VERIFIED',
        'Git safety verified: .gitignore active, 0 video binaries tracked, 0 secrets tracked.',
        'SUCCESS'
      );

      return {
        success: true,
        stage: this.stage,
        message: 'Git safety rules and .gitignore patterns verified successfully.',
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      context.logger.error(this.stage, 'SAFETY_VIOLATION', error.message);
      return {
        success: false,
        stage: this.stage,
        error,
        message: error.message,
      };
    }
  }
}
