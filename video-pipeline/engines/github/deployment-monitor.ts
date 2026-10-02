/**
 * Deployment Monitor
 * Monitors GitHub Actions execution until completion.
 */

import type { GitHubActionsClient, WorkflowRunSummary } from './actions-client.js';
import { GitHubActionsError } from '../../core/errors/pipeline-errors.js';

export interface MonitorOptions {
  repo: string;
  branch: string;
  expectedCommitSha?: string;
  timeoutMs: number;
  pollIntervalMs: number;
}

export class DeploymentMonitor {
  constructor(private readonly client: GitHubActionsClient) {}

  public async waitForSuccessfulDeployment(options: MonitorOptions): Promise<WorkflowRunSummary> {
    // In Phase 01: Architectural interface definition.
    const run = await this.client.getLatestRun(options.repo, options.branch);
    if (!run) {
      throw new GitHubActionsError('No workflow run detected on repository.');
    }
    return run;
  }
}
