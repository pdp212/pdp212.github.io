/**
 * Pipeline State Machine
 * Formally defines allowed state transitions and prevents illegal bypasses.
 */

import type { PipelineStage } from '../core/errors/pipeline-errors.js';

export interface TransitionValidationResult {
  valid: boolean;
  error?: string;
}

export class PipelineStateMachine {
  /**
   * Complete map of permissible state transitions.
   * Enforces strictly that failure or intermediate steps cannot be bypassed.
   */
  private static readonly ALLOWED_TRANSITIONS: Record<PipelineStage, readonly PipelineStage[]> = {
    IDLE: ['VALIDATING', 'CANCELLED'],
    VALIDATING: ['ENCODING', 'FAILED', 'CANCELLED'],
    ENCODING: ['UPLOADING_R2', 'COMPLETED', 'FAILED', 'CANCELLED'],
    UPLOADING_R2: ['VERIFYING_R2', 'FAILED', 'CANCELLED'],
    VERIFYING_R2: ['VERIFYING_STREAM', 'FAILED', 'CANCELLED'],
    VERIFYING_STREAM: ['UPDATING_MANIFEST', 'FAILED', 'CANCELLED'],
    UPDATING_MANIFEST: ['CLEANING_GIT', 'FAILED', 'CANCELLED'],
    CLEANING_GIT: ['VERIFYING_GIT', 'FAILED', 'CANCELLED'],
    VERIFYING_GIT: ['RUNNING_TESTS', 'FAILED', 'CANCELLED'],
    RUNNING_TESTS: ['READY_TO_COMMIT', 'COMMITTING', 'FAILED', 'CANCELLED'],
    READY_TO_COMMIT: ['COMMITTING', 'FAILED', 'CANCELLED'],
    COMMITTING: ['PUSHING', 'FAILED', 'CANCELLED'],
    PUSHING: ['WAITING_FOR_GITHUB_ACTIONS', 'FAILED', 'CANCELLED'],
    WAITING_FOR_GITHUB_ACTIONS: ['PRODUCTION_SMOKE_TEST', 'FAILED', 'CANCELLED'],
    PRODUCTION_SMOKE_TEST: ['COMPLETED', 'FAILED', 'CANCELLED'],
    COMPLETED: ['IDLE'],
    FAILED: ['IDLE'],
    CANCELLED: ['IDLE'],
  };

  /**
   * Validates whether moving from currentState to targetState is permitted.
   */
  public static canTransition(from: PipelineStage, to: PipelineStage): boolean {
    const allowed = this.ALLOWED_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  /**
   * Asserts that a state transition is legal, or returns an explicit error.
   */
  public static validateTransition(from: PipelineStage, to: PipelineStage): TransitionValidationResult {
    if (!this.canTransition(from, to)) {
      return {
        valid: false,
        error: `Illegal state transition: Cannot move from '${from}' to '${to}'. Intermediate requirements not fulfilled.`,
      };
    }
    return { valid: true };
  }

  /**
   * Returns all possible next stages from the given stage.
   */
  public static getNextAllowedStages(current: PipelineStage): readonly PipelineStage[] {
    return this.ALLOWED_TRANSITIONS[current] || [];
  }
}
