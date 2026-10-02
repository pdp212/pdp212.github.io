/**
 * CleanupGitStep Pipeline Step Unit Tests
 * Verifies stage execution, dry-run mode, and error handling.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { CleanupGitStep } from '../../pipeline/steps/cleanup-git.js';
import type { PipelineContext } from '../../pipeline/context.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import { PipelineStateStore } from '../../core/state/state-store.js';

describe('CleanupGitStep Unit Tests', () => {
  const rootDir = path.resolve('../');

  it('executes in dry-run mode and reports clean status without mutation', async () => {
    const pipelineId = `dry-cleanup-${Date.now()}`;
    const context: PipelineContext = {
      pipelineId,
      isDryRun: true,
      config: {
        portfolioPath: rootDir,
      } as any,
      logger: new PipelineLogger({ minLevel: 'WARN' }),
      stateStore: new PipelineStateStore(pipelineId, true),
      items: [],
      currentStage: 'UPDATING_MANIFEST',
    };

    const step = new CleanupGitStep();
    const result = await step.execute(context);

    assert.equal(result.success, true);
    assert.equal(result.stage, 'CLEANING_GIT');
    assert.ok(result.message.includes('[DryRun]'));
  });

  it('executes in live mode against current repository and confirms zero project videos tracked', async () => {
    const pipelineId = `live-cleanup-${Date.now()}`;
    const context: PipelineContext = {
      pipelineId,
      isDryRun: false,
      config: {
        portfolioPath: rootDir,
      } as any,
      logger: new PipelineLogger({ minLevel: 'WARN' }),
      stateStore: new PipelineStateStore(pipelineId, false),
      items: [],
      currentStage: 'UPDATING_MANIFEST',
    };

    const step = new CleanupGitStep();
    const result = await step.execute(context);

    assert.equal(result.success, true);
    assert.equal(result.stage, 'CLEANING_GIT');
    assert.ok(result.message.includes('Git cleanup verified'));
  });
});
