/**
 * Step 11: Git Remote Push
 *
 * Phase 07 – the only phase permitted to run `git push`.
 *
 * Safety rules enforced:
 *   - Pushes the current branch to `origin` only.
 *   - --force and --force-with-lease are strictly prohibited.
 *   - Verifies the branch before push.
 *   - Halts on any push error; does NOT attempt to repair remote state.
 */

import path from 'node:path';
import type { PipelineStep, StepResult } from './step-interface.js';
import type { PipelineContext } from '../context.js';
import { dryRunGuard, execAsync, getCurrentBranch } from './_utils.js';

export class PushStep implements PipelineStep {
  public readonly stage = 'PUSHING' as const;
  public readonly name = 'Git Remote Push';

  public async execute(context: PipelineContext): Promise<StepResult> {
    context.logger.info(this.stage, 'START', 'Verifying push configuration...');

    // 1. Dry-run guard
    const early = dryRunGuard(this.stage, context, 'Git push skipped.');
    if (early) return early;

    try {
      const portfolioRoot = path.resolve(process.cwd(), context.config.portfolioPath || '../');

      // 2. Resolve current branch
      const branch = await getCurrentBranch(portfolioRoot);
      if (!branch) throw new Error('Unable to determine current Git branch.');
      context.gitBranchOriginal = branch;
      context.logger.info(this.stage, 'BRANCH', `Pushing branch '${branch}' to origin.`);

      // 3. Execute push – no force flags, ever.
      await execAsync(`git push origin ${branch}`, { cwd: portfolioRoot });

      context.logger.info(
        this.stage,
        'PUSHED',
        `Branch '${branch}' pushed to origin successfully.`,
        'SUCCESS'
      );

      return {
        success: true,
        stage: this.stage,
        message: `Push successful: origin/${branch}`,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      context.logger.error(this.stage, 'PUSH_FAILED', error.message);
      return { success: false, stage: this.stage, error, message: error.message };
    }
  }
}
