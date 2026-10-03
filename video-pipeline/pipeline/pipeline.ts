/**
 * Pipeline Orchestrator
 * Coordinates step execution, enforces state transitions, and halts immediately on error.
 */

import { PipelineStateMachine } from './state-machine.js';
import type { PipelineContext } from './context.js';
import type { PipelineStep, StepResult } from './steps/step-interface.js';
import {
  ValidateStep,
  UploadR2Step,
  VerifyR2Step,
  VerifyStreamStep,
  UpdateManifestStep,
  CleanupGitStep,
  VerifyGitignoreStep,
  RunTestsStep,
  CommitStep,
  PushStep,
  GitHubActionsStep,
  ProductionSmokeStep,
} from './steps/index.js';

export interface PipelineExecutionResult {
  pipelineId: string;
  success: boolean;
  finalStage: string;
  durationMs: number;
  results: StepResult[];
  error?: Error;
}

export class VideoPipelineOrchestrator {
  private readonly steps: PipelineStep[];

  constructor(customSteps?: PipelineStep[]) {
    this.steps = customSteps || [
      new ValidateStep(),
      new UploadR2Step(),
      new VerifyR2Step(),
      new VerifyStreamStep(),
      new UpdateManifestStep(),
      new CleanupGitStep(),
      new VerifyGitignoreStep(),
      new RunTestsStep(),
      new CommitStep(),
      new PushStep(),
      new GitHubActionsStep(),
      new ProductionSmokeStep(),
    ];
  }

  /**
   * Executes the pipeline sequentially.
   * Stops immediately upon encountering any failure, or stops after stopAfterStage if specified.
   */
  public async execute(context: PipelineContext, stopAfterStage?: import('../core/errors/pipeline-errors.js').PipelineStage): Promise<PipelineExecutionResult> {
    const startTime = Date.now();
    const results: StepResult[] = [];

    context.logger.info('IDLE', 'PIPELINE_START', `Starting video pipeline ${context.pipelineId} (DryRun: ${context.isDryRun})`);

    for (const step of this.steps) {
      // 0. Check for cancellation before executing next step
      if (context.abortController?.signal.aborted || context.isCancelled) {
        context.isCancelled = true;
        context.stateStore.transitionTo('CANCELLED', 'Pipeline execution cancelled by user request');
        context.currentStage = 'CANCELLED';
        context.logger.warn('CANCELLED', 'PIPELINE_CANCELLED', 'Pipeline execution cancelled by user request.');
        return {
          pipelineId: context.pipelineId,
          success: false,
          finalStage: 'CANCELLED',
          durationMs: Date.now() - startTime,
          results,
          error: new Error('Pipeline execution cancelled by user request.'),
        };
      }

      // 1. Validate State Transition
      const transition = PipelineStateMachine.validateTransition(context.currentStage, step.stage);
      if (!transition.valid) {
        const transitionError = new Error(transition.error);
        context.stateStore.transitionTo('FAILED', transition.error);
        context.logger.error(context.currentStage, 'TRANSITION_ERROR', transition.error || 'Transition denied');
        return {
          pipelineId: context.pipelineId,
          success: false,
          finalStage: 'FAILED',
          durationMs: Date.now() - startTime,
          results,
          error: transitionError,
        };
      }

      // 2. Perform Transition
      context.currentStage = step.stage;
      context.stateStore.transitionTo(step.stage);

      // 3. Execute Step
      try {
        const result = await step.execute(context);
        results.push(result);

        // Check if aborted during step execution
        if (context.abortController?.signal.aborted || context.isCancelled) {
          context.stateStore.transitionTo('CANCELLED', 'Pipeline execution cancelled by user request');
          context.currentStage = 'CANCELLED';
          context.logger.warn('CANCELLED', 'PIPELINE_CANCELLED', 'Pipeline execution cancelled by user request.');
          return {
            pipelineId: context.pipelineId,
            success: false,
            finalStage: 'CANCELLED',
            durationMs: Date.now() - startTime,
            results,
            error: new Error('Pipeline execution cancelled by user request.'),
          };
        }

        if (!result.success) {
          context.stateStore.transitionTo('FAILED', result.message);
          context.currentStage = 'FAILED';
          context.logger.error(step.stage, 'STEP_FAILED', `Halt on failure: ${result.message}`);
          return {
            pipelineId: context.pipelineId,
            success: false,
            finalStage: 'FAILED',
            durationMs: Date.now() - startTime,
            results,
            error: result.error || new Error(result.message),
          };
        }

        // If target stage reached, halt cleanly without proceeding to subsequent steps or marking COMPLETED
        if (stopAfterStage && step.stage === stopAfterStage) {
          context.logger.info(step.stage, 'STOP_AFTER_STAGE', `Reached target stage '${stopAfterStage}'. Halting execution as requested.`);
          return {
            pipelineId: context.pipelineId,
            success: true,
            finalStage: stopAfterStage,
            durationMs: Date.now() - startTime,
            results,
          };
        }
      } catch (err) {
        const isCancelled =
          context.abortController?.signal.aborted ||
          context.isCancelled ||
          (err instanceof Error && (err.name === 'PipelineCancelledError' || err.message.toLowerCase().includes('cancelled')));

        if (isCancelled) {
          context.stateStore.transitionTo('CANCELLED', 'Pipeline execution cancelled');
          context.currentStage = 'CANCELLED';
          context.logger.warn('CANCELLED', 'PIPELINE_CANCELLED', 'Pipeline execution cancelled during active step.');
          return {
            pipelineId: context.pipelineId,
            success: false,
            finalStage: 'CANCELLED',
            durationMs: Date.now() - startTime,
            results,
            error: err instanceof Error ? err : new Error('Pipeline execution cancelled'),
          };
        }

        const error = err instanceof Error ? err : new Error(String(err));
        context.stateStore.transitionTo('FAILED', error.message);
        context.currentStage = 'FAILED';
        context.logger.error(step.stage, 'UNCAUGHT_ERROR', error.message);
        return {
          pipelineId: context.pipelineId,
          success: false,
          finalStage: 'FAILED',
          durationMs: Date.now() - startTime,
          results,
          error,
        };
      }
    }

    // 4. Mark Pipeline Completed
    context.stateStore.transitionTo('COMPLETED', 'All pipeline steps finished successfully');
    context.currentStage = 'COMPLETED';
    context.logger.info('COMPLETED', 'PIPELINE_COMPLETE', `Pipeline ${context.pipelineId} completed successfully.`, 'SUCCESS');

    return {
      pipelineId: context.pipelineId,
      success: true,
      finalStage: 'COMPLETED',
      durationMs: Date.now() - startTime,
      results,
    };
  }
}
