/**
 * Step 12: GitHub Actions Deployment Monitor
 *
 * Phase 07 – waits for the GitHub Pages deployment triggered by the push to
 * complete successfully before allowing the pipeline to advance to the
 * production smoke test.
 *
 * Strategy (in order of availability):
 *   1. GitHub CLI (`gh`) – preferred when present, avoids manual token handling.
 *   2. GitHub REST API – fallback using GITHUB_TOKEN env variable.
 *
 * Timeout: context.config.timeout.githubActionsMs (default: 5 min = 300 000 ms).
 * Poll interval: 8 seconds.
 *
 * Prohibited: no history modifications, no re-push, no force operations.
 */

import path from 'node:path';
import type { PipelineStep, StepResult } from './step-interface.js';
import type { PipelineContext } from '../context.js';
import { dryRunGuard, execAsync } from './_utils.js';

const POLL_INTERVAL_MS = 8_000;

interface WorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  head_sha: string;
  name: string;
}

export class GitHubActionsStep implements PipelineStep {
  public readonly stage = 'WAITING_FOR_GITHUB_ACTIONS' as const;
  public readonly name = 'GitHub Actions Deployment Monitor';

  // --------------------------------------------------------------------------
  // Internal: resolve the run ID for the current commit via `gh` CLI
  // --------------------------------------------------------------------------
  private async resolveRunIdViaCli(
    repo: string,
    sha: string
  ): Promise<string | null> {
    try {
      const { stdout } = await execAsync(
        `gh run list --repo ${repo} --json headSha,databaseId --limit 10`,
        { timeout: 15_000 }
      );
      const runs: Array<{ headSha: string; databaseId: number }> = JSON.parse(stdout);
      const match = runs.find((r) => r.headSha === sha);
      return match ? String(match.databaseId) : null;
    } catch {
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Internal: poll the run until completed or timeout
  // --------------------------------------------------------------------------
  private async pollUntilComplete(
    repo: string,
    runId: string,
    timeoutMs: number,
    context: PipelineContext
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const token = process.env['GITHUB_TOKEN'];
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    while (Date.now() < deadline) {
      // Prefer gh CLI (no token needed in most setups)
      let status = '';
      let conclusion = '';

      try {
        const { stdout } = await execAsync(
          `gh run view ${runId} --repo ${repo} --json status,conclusion`,
          { timeout: 15_000 }
        );
        const data = JSON.parse(stdout);
        status = data.status;
        conclusion = data.conclusion ?? '';
      } catch {
        // Fallback: REST API
        const url = `https://api.github.com/repos/${repo}/actions/runs/${runId}`;
        const res = await fetch(url, { headers });
        if (!res.ok) {
          throw new Error(`GitHub API returned HTTP ${res.status} for run ${runId}`);
        }
        const data: WorkflowRun = await res.json() as WorkflowRun;
        status = data.status;
        conclusion = data.conclusion ?? '';
      }

      context.logger.info(
        this.stage,
        'POLL',
        `Run ${runId}: status=${status} conclusion=${conclusion || 'pending'}`
      );

      if (status === 'completed') {
        if (conclusion === 'success') return;
        throw new Error(`GitHub Actions run ${runId} ended with conclusion: '${conclusion}'.`);
      }

      await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    throw new Error(
      `GitHub Actions monitoring timed out after ${timeoutMs / 1000}s. ` +
        `Run ${runId} did not complete in time.`
    );
  }

  // --------------------------------------------------------------------------
  // Step execution
  // --------------------------------------------------------------------------
  public async execute(context: PipelineContext): Promise<StepResult> {
    context.logger.info(
      this.stage,
      'START',
      'Waiting for GitHub Actions deployment to complete...'
    );

    // 1. Dry-run guard
    const early = dryRunGuard(this.stage, context, 'GitHub Actions monitoring skipped.');
    if (early) return early;

    try {
      const portfolioRoot = path.resolve(process.cwd(), context.config.portfolioPath || '../');
      const repo = context.config.git.repository; // e.g. "pdp212/pdp212.github.io"
      const timeoutMs = context.config.timeout.githubActionsMs || 300_000;

      // 2. Resolve commit SHA (from context if CommitStep ran, else from git)
      let sha = context.gitCommitSha ?? '';
      if (!sha) {
        const { stdout } = await execAsync('git rev-parse HEAD', { cwd: portfolioRoot });
        sha = stdout.trim();
      }
      context.logger.info(this.stage, 'SHA', `Monitoring deployment for commit ${sha}.`);

      // 3. Wait briefly for GitHub Actions to register the run
      context.logger.info(this.stage, 'WAIT', 'Waiting 10s for Actions to register the run...');
      await new Promise<void>((r) => setTimeout(r, 10_000));

      // 4. Resolve run ID
      let runId = await this.resolveRunIdViaCli(repo, sha);

      // Retry once more after another short delay if not found
      if (!runId) {
        await new Promise<void>((r) => setTimeout(r, 10_000));
        runId = await this.resolveRunIdViaCli(repo, sha);
      }

      if (!runId) {
        throw new Error(
          `No GitHub Actions run found for commit ${sha} in ${repo}. ` +
            'Ensure the push triggered a workflow and GITHUB_TOKEN or gh CLI is configured.'
        );
      }

      context.logger.info(this.stage, 'RUN_FOUND', `Found run ID: ${runId}`);

      // 5. Poll until complete
      await this.pollUntilComplete(repo, runId, timeoutMs, context);

      context.logger.info(
        this.stage,
        'ACTIONS_SUCCESS',
        `Run ${runId} completed successfully.`,
        'SUCCESS'
      );

      return {
        success: true,
        stage: this.stage,
        message: `GitHub Actions run ${runId} completed successfully.`,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      context.logger.error(this.stage, 'ACTIONS_FAILED', error.message);
      return { success: false, stage: this.stage, error, message: error.message };
    }
  }
}
