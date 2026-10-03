/**
 * Step 12: GitHub Actions Deployment Monitor
 *
 * Waits for the GitHub Pages deployment triggered by the push to
 * complete successfully before allowing the pipeline to advance to the
 * production smoke test.
 *
 * Strategy (in order of availability):
 *   1. GitHub REST API – primary, deterministic, zero external binary dependency.
 *   2. GitHub CLI (`gh`) – optional fallback adapter when present.
 *
 * Timeouts:
 *   - Discovery timeout: 60s (polls every 5s until run is registered).
 *   - Execution timeout: context.config.timeout.githubActionsMs (default: 15 min = 900 000 ms).
 *   - Poll interval: 8s.
 *
 * Prohibited: no history modifications, no re-push, no force operations.
 */

import path from 'node:path';
import type { PipelineStep, StepResult } from './step-interface.js';
import type { PipelineContext } from '../context.js';
import { dryRunGuard, execAsync } from './_utils.js';
import { GitHubActionsError, PipelineCancelledError } from '../../core/errors/pipeline-errors.js';

const POLL_INTERVAL_MS = 8_000;
const DISCOVERY_INTERVAL_MS = 5_000;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 60_000;

export interface WorkflowRunInfo {
  id: number;
  name: string;
  headSha: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  createdAt: string;
}

/**
 * Interruptible sleep helper supporting AbortSignal.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new PipelineCancelledError('Operation cancelled'));
      return;
    }

    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new PipelineCancelledError('Operation cancelled'));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export class GitHubActionsStep implements PipelineStep {
  public readonly stage = 'WAITING_FOR_GITHUB_ACTIONS' as const;
  public readonly name = 'GitHub Actions Deployment Monitor';

  /**
   * Primary: Resolve workflow run ID via GitHub REST API.
   */
  public async resolveRunViaRest(
    repo: string,
    sha: string,
    token?: string
  ): Promise<WorkflowRunInfo | null> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'video-pipeline',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `https://api.github.com/repos/${repo}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=20`;

    try {
      const res = await fetch(url, { headers });

      if (res.status === 401) {
        throw new GitHubActionsError(
          `GitHub API authentication failed (HTTP 401) for repository '${repo}'. ` +
            'Please verify that GITHUB_TOKEN has valid permissions.'
        );
      }
      if (res.status === 403 || res.status === 429) {
        throw new GitHubActionsError(
          `GitHub API rate limit exceeded or access forbidden (HTTP ${res.status}) for repository '${repo}'.`
        );
      }
      if (res.status === 404) {
        throw new GitHubActionsError(
          `GitHub repository '${repo}' was not found or is inaccessible (HTTP 404).`
        );
      }

      if (res.ok) {
        const data = (await res.json()) as {
          workflow_runs?: Array<{
            id: number;
            name: string;
            head_sha: string;
            status: string;
            conclusion: string | null;
            html_url?: string;
            created_at: string;
            head_commit?: { id: string };
          }>;
        };

        if (data.workflow_runs && data.workflow_runs.length > 0) {
          const matches = data.workflow_runs.filter(
            (r) => r.head_sha === sha || r.head_commit?.id === sha
          );

          if (matches.length > 0) {
            // Sort by createdAt descending to pick the latest run matching the commit
            matches.sort(
              (a, b) =>
                (b.created_at ? new Date(b.created_at).getTime() : 0) -
                (a.created_at ? new Date(a.created_at).getTime() : 0)
            );
            const r = matches[0];
            return {
              id: r.id,
              name: r.name || 'Deployment Workflow',
              headSha: r.head_sha,
              status: r.status,
              conclusion: r.conclusion,
              htmlUrl: r.html_url || `https://github.com/${repo}/actions/runs/${r.id}`,
              createdAt: r.created_at || new Date().toISOString(),
            };
          }
        }
      }
    } catch (err) {
      if (err instanceof GitHubActionsError) {
        throw err;
      }
      // Transient network or JSON parse errors during discovery are caught for retry
    }

    return null;
  }

  /**
   * Optional Fallback: Resolve workflow run ID via `gh` CLI when installed.
   */
  public async resolveRunViaCli(
    repo: string,
    sha: string
  ): Promise<WorkflowRunInfo | null> {
    try {
      const { stdout } = await execAsync(
        `gh run list --repo ${repo} --commit ${sha} --json databaseId,headSha,name,status,conclusion,url,createdAt --limit 10`,
        { timeout: 15_000 }
      );
      const runs: Array<{
        databaseId: number;
        headSha: string;
        name: string;
        status: string;
        conclusion: string | null;
        url: string;
        createdAt: string;
      }> = JSON.parse(stdout);

      const match = runs.find((r) => r.headSha === sha);
      if (match) {
        return {
          id: match.databaseId,
          name: match.name || 'Deployment Workflow',
          headSha: match.headSha,
          status: match.status,
          conclusion: match.conclusion,
          htmlUrl: match.url || `https://github.com/${repo}/actions/runs/${match.databaseId}`,
          createdAt: match.createdAt,
        };
      }
    } catch {
      // `gh` CLI unavailable or failed
    }

    return null;
  }

  /**
   * Resolves workflow run with REST API first, then CLI fallback.
   */
  public async resolveRun(
    repo: string,
    sha: string,
    token?: string
  ): Promise<WorkflowRunInfo | null> {
    const viaRest = await this.resolveRunViaRest(repo, sha, token);
    if (viaRest) return viaRest;
    return this.resolveRunViaCli(repo, sha);
  }

  /**
   * Polls run status until completed or timeout.
   */
  public async pollUntilComplete(
    repo: string,
    runId: number,
    timeoutMs: number,
    context: PipelineContext
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const token = process.env['GITHUB_TOKEN'];
    const signal = context.abortController?.signal;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'video-pipeline',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    while (Date.now() < deadline) {
      if (signal?.aborted) {
        throw new PipelineCancelledError('GitHub Actions polling cancelled by user request.');
      }

      let status = '';
      let conclusion = '';
      let name = '';
      let htmlUrl = '';

      // 1. Try REST API
      try {
        const url = `https://api.github.com/repos/${repo}/actions/runs/${runId}`;
        const res = await fetch(url, { headers });

        if (res.status === 401) {
          throw new GitHubActionsError(
            `GitHub API authentication failed (HTTP 401) while polling run ${runId}.`
          );
        }
        if (res.status === 403 || res.status === 429) {
          throw new GitHubActionsError(
            `GitHub API rate limit exceeded (HTTP ${res.status}) while polling run ${runId}.`
          );
        }

        if (res.ok) {
          const data = (await res.json()) as {
            id: number;
            name: string;
            status: string;
            conclusion: string | null;
            html_url?: string;
          };
          status = data.status;
          conclusion = data.conclusion ?? '';
          name = data.name || '';
          htmlUrl = data.html_url || '';
        }
      } catch (err) {
        if (err instanceof GitHubActionsError) throw err;

        // Fallback to gh CLI if REST failed
        try {
          const { stdout } = await execAsync(
            `gh run view ${runId} --repo ${repo} --json name,status,conclusion,url`,
            { timeout: 15_000 }
          );
          const data = JSON.parse(stdout);
          status = data.status;
          conclusion = data.conclusion ?? '';
          name = data.name || name;
          htmlUrl = data.url || htmlUrl;
        } catch {
          // Transient failure, retry next loop
        }
      }

      if (status) {
        context.logger.info(
          this.stage,
          'POLL',
          `Run ${runId} (${name || 'Workflow'}): status=${status}, conclusion=${conclusion || 'in_progress'}${
            htmlUrl ? ` | ${htmlUrl}` : ''
          }`
        );

        if (status === 'completed') {
          if (conclusion === 'success') {
            return;
          }
          throw new GitHubActionsError(
            `GitHub Actions run ${runId} (${name || 'Workflow'}) completed with conclusion: '${conclusion}'. URL: ${
              htmlUrl || `https://github.com/${repo}/actions/runs/${runId}`
            }`
          );
        }
      }

      await sleep(POLL_INTERVAL_MS, signal);
    }

    throw new GitHubActionsError(
      `GitHub Actions monitoring timed out after ${timeoutMs / 1000}s. ` +
        `Run ${runId} did not complete in time.`
    );
  }

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
      const timeoutMs = context.config.timeout.githubActionsMs || 900_000;
      const token = process.env['GITHUB_TOKEN'];
      const signal = context.abortController?.signal;

      // 2. Resolve commit SHA
      let sha = context.gitCommitSha ?? '';
      if (!sha) {
        const { stdout } = await execAsync('git rev-parse HEAD', { cwd: portfolioRoot });
        sha = stdout.trim();
      }
      context.logger.info(this.stage, 'SHA', `Monitoring deployment for commit ${sha}.`);

      // 3. Discovery loop: poll for GitHub Actions to register the run
      const discoveryTimeoutMs = Math.min(DEFAULT_DISCOVERY_TIMEOUT_MS, timeoutMs);
      const discoveryDeadline = Date.now() + discoveryTimeoutMs;
      let attempt = 0;
      let runInfo: WorkflowRunInfo | null = null;

      while (Date.now() < discoveryDeadline) {
        if (signal?.aborted) {
          throw new PipelineCancelledError('GitHub Actions discovery cancelled by user request.');
        }

        attempt++;
        context.logger.info(
          this.stage,
          'DISCOVER',
          `Discovering workflow run for commit ${sha} (attempt ${attempt})...`
        );

        runInfo = await this.resolveRun(repo, sha, token);
        if (runInfo) break;

        await sleep(DISCOVERY_INTERVAL_MS, signal);
      }

      if (!runInfo) {
        throw new GitHubActionsError(
          `No GitHub Actions workflow run found for commit ${sha} in ${repo} after ${discoveryTimeoutMs / 1000}s. ` +
            'Ensure the push triggered a workflow and the repository is accessible.'
        );
      }

      context.logger.info(
        this.stage,
        'RUN_FOUND',
        `Found workflow run ${runInfo.id} (${runInfo.name}) at ${runInfo.htmlUrl}`
      );

      // 4. Poll until complete
      await this.pollUntilComplete(repo, runInfo.id, timeoutMs, context);

      context.logger.info(
        this.stage,
        'ACTIONS_SUCCESS',
        `GitHub Actions deployment for run ${runInfo.id} (${runInfo.name}) completed successfully.`,
        'SUCCESS'
      );

      return {
        success: true,
        stage: this.stage,
        message: `GitHub Actions run ${runInfo.id} (${runInfo.name}) completed successfully.`,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      context.logger.error(this.stage, 'ACTIONS_FAILED', error.message);
      return { success: false, stage: this.stage, error, message: error.message };
    }
  }
}
