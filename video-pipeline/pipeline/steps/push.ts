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
import { dryRunGuard, execAsync, getCurrentBranch, getTrackedVideoFiles } from './_utils.js';

export class PushStep implements PipelineStep {
  public readonly stage = 'PUSHING' as const;
  public readonly name = 'Git Remote Push';

  public async execute(context: PipelineContext): Promise<StepResult> {
    context.logger.info(this.stage, 'START', 'Verifying push configuration and safety...');

    // 1. Dry-run guard
    const early = dryRunGuard(this.stage, context, 'Git push skipped.');
    if (early) return early;

    try {
      const portfolioRoot = path.resolve(process.cwd(), context.config.portfolioPath || '../');

      // 2. Resolve current branch
      const branch = await getCurrentBranch(portfolioRoot);
      if (!branch) throw new Error('Unable to determine current Git branch.');
      if (branch !== context.config.git.branch) {
        throw new Error(`Push blocked: current branch '${branch}' does not match configured branch '${context.config.git.branch}'.`);
      }
      context.gitBranchOriginal = branch;

      // 3. Inspect remote configuration
      let remoteUrl = '';
      try {
        const { stdout } = await execAsync('git config --get remote.origin.url', { cwd: portfolioRoot });
        remoteUrl = stdout.trim();
      } catch {
        remoteUrl = 'origin';
      }
      context.logger.info(this.stage, 'REMOTE_INFO', `Push target: origin (${remoteUrl}) · Branch: ${branch}`);

      // 4. Final safety audit before push
      const trackedVideos = await getTrackedVideoFiles(portfolioRoot, /assets\/videos\/projects\/|\.(mp4|mov|mkv|avi|webm)$/i);
      if (trackedVideos.length > 0) {
        throw new Error(
          `Push blocked: production video(s) detected in Git index:\n  ${trackedVideos.join('\n  ')}`
        );
      }

      // 5. Execute push – strictly standard push, NO force flags, ever.
      await execAsync(`git push origin ${branch}`, { cwd: portfolioRoot });

      // 6. Confirm pushed SHA
      let pushedSha = context.gitCommitSha;
      if (!pushedSha) {
        const { stdout: sha } = await execAsync('git rev-parse HEAD', { cwd: portfolioRoot });
        pushedSha = sha.trim();
        context.gitCommitSha = pushedSha;
      }

      context.logger.info(
        this.stage,
        'PUSHED',
        `Branch '${branch}' (SHA: ${pushedSha}) pushed to origin successfully.`,
        'SUCCESS'
      );
      context.logger.info(
        this.stage,
        'PUSH_SUMMARY',
        `REMOTE: origin (${remoteUrl})\nBRANCH: ${branch}\nCOMMIT SHA: ${pushedSha}\nPUSH SUCCESS`
      );

      return {
        success: true,
        stage: this.stage,
        message: `Push successful: origin/${branch} (${pushedSha})`,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      context.logger.error(this.stage, 'PUSH_FAILED', error.message);
      return { success: false, stage: this.stage, error, message: error.message };
    }
  }
}
