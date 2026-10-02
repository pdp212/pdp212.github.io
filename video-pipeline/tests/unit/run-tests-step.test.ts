/**
 * RunTestsStep Pipeline Step Unit Tests
 * Verifies execution of pre-commit integrity tests and state transition to READY_TO_COMMIT.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { RunTestsStep } from '../../pipeline/steps/run-tests.js';
import type { PipelineContext } from '../../pipeline/context.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import { PipelineStateStore } from '../../core/state/state-store.js';

describe('RunTestsStep Unit Tests', () => {
  const rootDir = path.resolve('../');

  it('runs configured test command (node scripts/validate.js) and transitions to READY_TO_COMMIT', async () => {
    const pipelineId = `test-run-step-${Date.now()}`;
    const context: PipelineContext = {
      pipelineId,
      isDryRun: false,
      config: {
        portfolioPath: rootDir,
        testCommands: ['node scripts/validate.js'],
      } as any,
      logger: new PipelineLogger({ minLevel: 'WARN' }),
      stateStore: new PipelineStateStore(pipelineId, false),
      items: [],
      currentStage: 'VERIFYING_GIT',
    };

    const step = new RunTestsStep();
    const result = await step.execute(context);

    assert.equal(result.success, true);
    assert.equal(result.stage, 'RUNNING_TESTS');
    assert.equal(context.currentStage, 'READY_TO_COMMIT');
    assert.ok(result.message.includes('Pre-commit test gate passed'));
  });

  it('fails gracefully when a test command returns non-zero exit code', async () => {
    const pipelineId = `test-run-fail-${Date.now()}`;
    const context: PipelineContext = {
      pipelineId,
      isDryRun: false,
      config: {
        portfolioPath: rootDir,
        testCommands: ['node -e "process.exit(1)"'],
      } as any,
      logger: new PipelineLogger({ minLevel: 'WARN' }),
      stateStore: new PipelineStateStore(pipelineId, false),
      items: [],
      currentStage: 'VERIFYING_GIT',
    };

    const step = new RunTestsStep();
    const result = await step.execute(context);

    assert.equal(result.success, false);
    assert.ok(result.message.includes('failed:'));
  });
});
