/**
 * Unit Test: Pipeline State Machine Transitions
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PipelineStateMachine } from '../../pipeline/state-machine.js';

describe('Pipeline State Machine', () => {
  test('allows legal linear transitions', () => {
    assert.strictEqual(PipelineStateMachine.canTransition('IDLE', 'VALIDATING'), true);
    assert.strictEqual(PipelineStateMachine.canTransition('VALIDATING', 'UPLOADING_R2'), true);
    assert.strictEqual(PipelineStateMachine.canTransition('UPLOADING_R2', 'VERIFYING_R2'), true);
    assert.strictEqual(PipelineStateMachine.canTransition('VERIFYING_R2', 'VERIFYING_STREAM'), true);
    assert.strictEqual(PipelineStateMachine.canTransition('VERIFYING_STREAM', 'UPDATING_MANIFEST'), true);
    assert.strictEqual(PipelineStateMachine.canTransition('UPDATING_MANIFEST', 'CLEANING_GIT'), true);
    assert.strictEqual(PipelineStateMachine.canTransition('CLEANING_GIT', 'VERIFYING_GIT'), true);
    assert.strictEqual(PipelineStateMachine.canTransition('VERIFYING_GIT', 'RUNNING_TESTS'), true);
    assert.strictEqual(PipelineStateMachine.canTransition('RUNNING_TESTS', 'READY_TO_COMMIT'), true);
    assert.strictEqual(PipelineStateMachine.canTransition('READY_TO_COMMIT', 'COMMITTING'), true);
    assert.strictEqual(PipelineStateMachine.canTransition('COMMITTING', 'PUSHING'), true);
    assert.strictEqual(PipelineStateMachine.canTransition('PUSHING', 'WAITING_FOR_GITHUB_ACTIONS'), true);
    assert.strictEqual(PipelineStateMachine.canTransition('WAITING_FOR_GITHUB_ACTIONS', 'PRODUCTION_SMOKE_TEST'), true);
    assert.strictEqual(PipelineStateMachine.canTransition('PRODUCTION_SMOKE_TEST', 'COMPLETED'), true);
  });

  test('strictly forbids bypassing intermediate stages', () => {
    assert.strictEqual(PipelineStateMachine.canTransition('FAILED', 'COMMITTING'), false);
    assert.strictEqual(PipelineStateMachine.canTransition('VERIFYING_STREAM', 'PUSHING'), false);
    assert.strictEqual(PipelineStateMachine.canTransition('IDLE', 'COMMITTING'), false);
    assert.strictEqual(PipelineStateMachine.canTransition('VALIDATING', 'COMPLETED'), false);
  });

  test('allows transitions to FAILED or CANCELLED from operational stages', () => {
    assert.strictEqual(PipelineStateMachine.canTransition('VALIDATING', 'FAILED'), true);
    assert.strictEqual(PipelineStateMachine.canTransition('UPLOADING_R2', 'FAILED'), true);
    assert.strictEqual(PipelineStateMachine.canTransition('RUNNING_TESTS', 'FAILED'), true);
    assert.strictEqual(PipelineStateMachine.canTransition('VALIDATING', 'CANCELLED'), true);
  });

  test('validateTransition returns actionable error messages on failure', () => {
    const result = PipelineStateMachine.validateTransition('FAILED', 'COMMITTING');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('Illegal state transition'));
  });
});
