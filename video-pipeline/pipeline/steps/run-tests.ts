/**
 * Step 9: Pre-Commit Portfolio Tests Execution
 * Executes portfolio validation tests (e.g., node scripts/validate.js) to guarantee integrity before commit.
 */

import { exec } from 'node:child_process';
import path from 'node:path';
import type { PipelineStep, StepResult } from './step-interface.js';
import type { PipelineContext } from '../context.js';
import { TestFailure } from '../../core/errors/pipeline-errors.js';

export class RunTestsStep implements PipelineStep {
  public readonly stage = 'RUNNING_TESTS' as const;
  public readonly name = 'Portfolio Integrity Tests';

  public async execute(context: PipelineContext): Promise<StepResult> {
    const commands = context.config.testCommands || ['node scripts/validate.js'];
    context.logger.info(this.stage, 'START', `Running ${commands.length} test suite(s): ${commands.join('; ')}...`);

    const portfolioRoot = path.resolve(process.cwd(), context.config.portfolioPath || '../');

    for (const cmd of commands) {
      context.logger.info(this.stage, 'EXEC_CMD', `Executing test: ${cmd}`);

      try {
        await new Promise<void>((resolve, reject) => {
          exec(cmd, { cwd: portfolioRoot }, (error, stdout, stderr) => {
            if (error) {
              reject(new TestFailure(`Test command '${cmd}' failed: ${stderr || stdout || error.message}`));
              return;
            }
            resolve();
          });
        });

        context.logger.info(this.stage, 'CMD_PASS', `Test '${cmd}' passed.`);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        context.logger.error(this.stage, 'TEST_FAILED', error.message);
        return {
          success: false,
          stage: this.stage,
          error,
          message: error.message,
        };
      }
    }

    context.logger.info(this.stage, 'ALL_TESTS_PASS', `All ${commands.length} test suite(s) passed successfully.`, 'SUCCESS');

    // Transition to READY_TO_COMMIT
    context.stateStore.transitionTo('READY_TO_COMMIT', 'Pre-commit test gate passed successfully');
    context.currentStage = 'READY_TO_COMMIT';

    return {
      success: true,
      stage: this.stage,
      message: `Pre-commit test gate passed: ${commands.length} suite(s) verified. Ready to commit.`,
    };
  }
}
