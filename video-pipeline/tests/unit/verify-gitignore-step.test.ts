/**
 * VerifyGitignoreStep Pipeline Step Unit Tests
 * Verifies .gitignore validation and Git safety rules.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { VerifyGitignoreStep } from '../../pipeline/steps/verify-gitignore.js';
import type { PipelineContext } from '../../pipeline/context.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import { PipelineStateStore } from '../../core/state/state-store.js';

describe('VerifyGitignoreStep Unit Tests', () => {
  const rootDir = path.resolve('../');

  it('verifies that current repository root .gitignore satisfies all safety requirements', async () => {
    const pipelineId = `test-verify-gi-${Date.now()}`;
    const context: PipelineContext = {
      pipelineId,
      isDryRun: false,
      config: {
        portfolioPath: rootDir,
      } as any,
      logger: new PipelineLogger({ minLevel: 'WARN' }),
      stateStore: new PipelineStateStore(pipelineId, false),
      items: [],
      currentStage: 'CLEANING_GIT',
    };

    const step = new VerifyGitignoreStep();
    const result = await step.execute(context);

    assert.equal(result.success, true);
    assert.equal(result.stage, 'VERIFYING_GIT');
    assert.ok(result.message.includes('verified successfully'));
  });

  it('fails if pointed to a directory with missing or invalid .gitignore', async () => {
    const pipelineId = `test-fail-gi-${Date.now()}`;
    const context: PipelineContext = {
      pipelineId,
      isDryRun: false,
      config: {
        portfolioPath: '/non/existent/path',
      } as any,
      logger: new PipelineLogger({ minLevel: 'WARN' }),
      stateStore: new PipelineStateStore(pipelineId, false),
      items: [],
      currentStage: 'CLEANING_GIT',
    };

    const step = new VerifyGitignoreStep();
    const result = await step.execute(context);

    assert.equal(result.success, false);
    assert.ok(result.message.includes('missing at:'));
  });
});
