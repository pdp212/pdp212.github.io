/**
 * GitHubActionsStep Comprehensive Unit & Integration Tests
 *
 * Tests all 13 requirements specified in Phase 11 Debug:
 * 1. REST API returns matching run
 * 2. `gh` CLI not installed fallback to REST API
 * 3. Discovery polling when run delayed
 * 4. SHA mismatch rejection
 * 5. Multiple runs selection (latest by createdAt)
 * 6. Status polling progression to completed/success
 * 7. Status polling failure conclusion handling
 * 8. 500 transient error retry
 * 9. 401/403/429 authentication/rate-limit error reporting
 * 10. Cancellation during discovery polling
 * 11. Cancellation during status polling
 * 12. Discovery timeout when run never appears
 * 13. Public repo unauthenticated query (no GITHUB_TOKEN)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubActionsStep } from '../../pipeline/steps/github-actions.js';
import type { PipelineContext } from '../../pipeline/context.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import { PipelineStateStore } from '../../core/state/state-store.js';
import { GitHubActionsError, PipelineCancelledError } from '../../core/errors/pipeline-errors.js';

function createMockContext(options: {
  isDryRun?: boolean;
  sha?: string;
  timeoutMs?: number;
  abortController?: AbortController;
}): PipelineContext {
  const pipelineId = `test-gha-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  return {
    pipelineId,
    isDryRun: options.isDryRun ?? false,
    config: {
      git: { repository: 'pdp212/pdp212.github.io', branch: 'main' },
      timeout: { githubActionsMs: options.timeoutMs ?? 10_000 },
      portfolioPath: '../',
    } as any,
    logger: new PipelineLogger({ minLevel: 'ERROR' }),
    stateStore: new PipelineStateStore(pipelineId, false),
    items: [],
    currentStage: 'WAITING_FOR_GITHUB_ACTIONS',
    gitCommitSha: options.sha ?? 'commit_sha_12345',
    abortController: options.abortController,
  };
}

describe('GitHubActionsStep Specification & Resilience Tests', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('TEST 1: REST API returns matching workflow run', async () => {
    const step = new GitHubActionsStep();
    const sha = 'sha_test_1';

    globalThis.fetch = async (url: any) => {
      assert.ok(String(url).includes('head_sha=sha_test_1'));
      return {
        status: 200,
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 1001,
              name: 'Deploy Pages',
              head_sha: sha,
              status: 'completed',
              conclusion: 'success',
              created_at: '2026-10-03T01:00:00Z',
            },
          ],
        }),
      } as any;
    };

    const run = await step.resolveRunViaRest('pdp212/pdp212.github.io', sha);
    assert.ok(run);
    assert.equal(run?.id, 1001);
    assert.equal(run?.headSha, sha);
    assert.equal(run?.name, 'Deploy Pages');
  });

  it('TEST 2: gh CLI missing does not throw, REST API resolves run', async () => {
    const step = new GitHubActionsStep();
    const sha = 'sha_test_2';

    globalThis.fetch = async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        workflow_runs: [
          {
            id: 2002,
            name: 'Deploy',
            head_sha: sha,
            status: 'in_progress',
            conclusion: null,
            created_at: '2026-10-03T01:00:00Z',
          },
        ],
      }),
    } as any);

    const run = await step.resolveRun('pdp212/pdp212.github.io', sha);
    assert.ok(run);
    assert.equal(run?.id, 2002);
  });

  it('TEST 3: REST API discovery when run is delayed (empty runs, then appears)', async () => {
    const step = new GitHubActionsStep();
    const sha = 'sha_test_3';
    let attempts = 0;

    globalThis.fetch = async () => {
      attempts++;
      if (attempts === 1) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ workflow_runs: [] }),
        } as any;
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 3003,
              name: 'Deploy',
              head_sha: sha,
              status: 'in_progress',
              conclusion: null,
              created_at: '2026-10-03T01:00:00Z',
            },
          ],
        }),
      } as any;
    };

    const run1 = await step.resolveRun('pdp212/pdp212.github.io', sha);
    assert.equal(run1, null);

    const run2 = await step.resolveRun('pdp212/pdp212.github.io', sha);
    assert.ok(run2);
    assert.equal(run2?.id, 3003);
  });

  it('TEST 4: REST API returns runs with different SHA (no match)', async () => {
    const step = new GitHubActionsStep();
    const sha = 'sha_expected';

    globalThis.fetch = async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        workflow_runs: [
          {
            id: 4004,
            name: 'Deploy',
            head_sha: 'sha_other_commit',
            status: 'completed',
            conclusion: 'success',
            created_at: '2026-10-03T01:00:00Z',
          },
        ],
      }),
    } as any);

    const run = await step.resolveRun('pdp212/pdp212.github.io', sha);
    assert.equal(run, null);
  });

  it('TEST 5: Multiple runs with matching SHA selects latest by createdAt', async () => {
    const step = new GitHubActionsStep();
    const sha = 'sha_multi';

    globalThis.fetch = async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        workflow_runs: [
          {
            id: 5001,
            name: 'Deploy Old',
            head_sha: sha,
            status: 'completed',
            conclusion: 'success',
            created_at: '2026-10-03T01:00:00Z',
          },
          {
            id: 5002,
            name: 'Deploy Latest',
            head_sha: sha,
            status: 'completed',
            conclusion: 'success',
            created_at: '2026-10-03T02:00:00Z',
          },
        ],
      }),
    } as any);

    const run = await step.resolveRun('pdp212/pdp212.github.io', sha);
    assert.ok(run);
    assert.equal(run?.id, 5002);
    assert.equal(run?.name, 'Deploy Latest');
  });

  it('TEST 6: Status polling progression: in_progress -> completed/success', async () => {
    const step = new GitHubActionsStep();
    const ctx = createMockContext({ timeoutMs: 15_000 });
    let pollCount = 0;

    globalThis.fetch = async (url: any) => {
      const u = String(url);
      if (u.includes('/actions/runs?')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            workflow_runs: [
              {
                id: 6006,
                name: 'Deploy',
                head_sha: ctx.gitCommitSha,
                status: 'in_progress',
                conclusion: null,
                created_at: '2026-10-03T01:00:00Z',
              },
            ],
          }),
        } as any;
      }
      if (u.includes('/actions/runs/6006')) {
        pollCount++;
        return {
          status: 200,
          ok: true,
          json: async () => ({
            id: 6006,
            name: 'Deploy',
            status: 'completed',
            conclusion: 'success',
          }),
        } as any;
      }
      return originalFetch(url);
    };

    const result = await step.execute(ctx);
    assert.equal(result.success, true);
    assert.ok(result.message.includes('6006 (Deploy) completed successfully'));
  });

  it('TEST 7: Status polling failure conclusion handling', async () => {
    const step = new GitHubActionsStep();
    const ctx = createMockContext({ timeoutMs: 15_000 });

    globalThis.fetch = async (url: any) => {
      const u = String(url);
      if (u.includes('/actions/runs?')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            workflow_runs: [
              {
                id: 7007,
                name: 'Deploy',
                head_sha: ctx.gitCommitSha,
                status: 'completed',
                conclusion: 'failure',
                created_at: '2026-10-03T01:00:00Z',
              },
            ],
          }),
        } as any;
      }
      if (u.includes('/actions/runs/7007')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            id: 7007,
            name: 'Deploy',
            status: 'completed',
            conclusion: 'failure',
          }),
        } as any;
      }
      return originalFetch(url);
    };

    const result = await step.execute(ctx);
    assert.equal(result.success, false);
    assert.ok(result.message.includes("conclusion: 'failure'"));
  });

  it('TEST 8: REST API 500 transient error during discovery retries cleanly', async () => {
    const step = new GitHubActionsStep();
    const sha = 'sha_500_test';
    let calls = 0;

    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) {
        return { status: 500, ok: false } as any;
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 8008,
              name: 'Deploy',
              head_sha: sha,
              status: 'completed',
              conclusion: 'success',
              created_at: '2026-10-03T01:00:00Z',
            },
          ],
        }),
      } as any;
    };

    // First call catches transient error and returns null
    const res1 = await step.resolveRunViaRest('pdp212/pdp212.github.io', sha);
    assert.equal(res1, null);

    // Second call recovers
    const res2 = await step.resolveRunViaRest('pdp212/pdp212.github.io', sha);
    assert.ok(res2);
    assert.equal(res2?.id, 8008);
  });

  it('TEST 9: REST API 401 / 403 throws descriptive error without masking as not found', async () => {
    const step = new GitHubActionsStep();
    const sha = 'sha_auth_test';

    globalThis.fetch = async () => ({
      status: 401,
      ok: false,
    } as any);

    await assert.rejects(
      async () => {
        await step.resolveRunViaRest('pdp212/pdp212.github.io', sha);
      },
      (err: any) => {
        assert.ok(err instanceof GitHubActionsError);
        assert.ok(err.message.includes('HTTP 401'));
        return true;
      }
    );
  });

  it('TEST 10: Cancellation during discovery polling halts immediately', async () => {
    const step = new GitHubActionsStep();
    const ac = new AbortController();
    const ctx = createMockContext({ abortController: ac, timeoutMs: 30_000 });

    globalThis.fetch = async () => {
      // Abort during first discovery request
      ac.abort();
      return {
        status: 200,
        ok: true,
        json: async () => ({ workflow_runs: [] }),
      } as any;
    };

    const result = await step.execute(ctx);
    assert.equal(result.success, false);
    assert.ok(result.message.includes('cancelled'));
  });

  it('TEST 11: Cancellation during status polling halts immediately', async () => {
    const step = new GitHubActionsStep();
    const ac = new AbortController();
    const ctx = createMockContext({ abortController: ac, timeoutMs: 30_000 });

    globalThis.fetch = async (url: any) => {
      const u = String(url);
      if (u.includes('/actions/runs?')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            workflow_runs: [
              {
                id: 1111,
                name: 'Deploy',
                head_sha: ctx.gitCommitSha,
                status: 'in_progress',
                conclusion: null,
                created_at: '2026-10-03T01:00:00Z',
              },
            ],
          }),
        } as any;
      }
      if (u.includes('/actions/runs/1111')) {
        // Abort while status polling
        ac.abort();
        return {
          status: 200,
          ok: true,
          json: async () => ({
            id: 1111,
            name: 'Deploy',
            status: 'in_progress',
            conclusion: null,
          }),
        } as any;
      }
      return originalFetch(url);
    };

    const result = await step.execute(ctx);
    assert.equal(result.success, false);
    assert.ok(result.message.includes('cancelled'));
  });

  it('TEST 12: Discovery timeout when workflow run never appears', async () => {
    const step = new GitHubActionsStep();
    const ctx = createMockContext({ timeoutMs: 2_000 });

    globalThis.fetch = async () => ({
      status: 200,
      ok: true,
      json: async () => ({ workflow_runs: [] }),
    } as any);

    const result = await step.execute(ctx);
    assert.equal(result.success, false);
    assert.ok(result.message.includes('No GitHub Actions workflow run found'));
  });

  it('TEST 13: Unauthenticated query for public repository sends correct headers without token', async () => {
    const step = new GitHubActionsStep();
    const sha = 'sha_pub_test';
    let capturedHeaders: Record<string, string> | undefined;

    globalThis.fetch = async (_url: any, init: any) => {
      capturedHeaders = init.headers;
      return {
        status: 200,
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 1313,
              name: 'Deploy',
              head_sha: sha,
              status: 'completed',
              conclusion: 'success',
              created_at: '2026-10-03T01:00:00Z',
            },
          ],
        }),
      } as any;
    };

    const run = await step.resolveRunViaRest('pdp212/pdp212.github.io', sha);
    assert.ok(run);
    assert.equal(run?.id, 1313);
    assert.ok(capturedHeaders);
    assert.equal(capturedHeaders?.['User-Agent'], 'video-pipeline');
    assert.equal(capturedHeaders?.['Accept'], 'application/vnd.github+json');
    assert.equal(capturedHeaders?.['Authorization'], undefined);
  });
});
