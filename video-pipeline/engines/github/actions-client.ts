/**
 * GitHub Actions API Client Interface
 * Interacts with GitHub REST API using GITHUB_TOKEN passed in memory.
 */

export interface WorkflowRunSummary {
  id: number;
  name: string;
  headSha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'timed_out' | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubActionsClient {
  getLatestRun(repo: string, branch: string): Promise<WorkflowRunSummary | null>;
  getRunStatus(repo: string, runId: number): Promise<WorkflowRunSummary>;
}

export class RestGitHubActionsClient implements GitHubActionsClient {
  constructor(private readonly token?: string) {}

  public async getLatestRun(repo: string, branch: string): Promise<WorkflowRunSummary | null> {
    // Phase 01: Architectural interface definition.
    return {
      id: 12345678,
      name: 'Deploy Portfolio to GitHub Pages',
      headSha: 'scaffold_sha',
      status: 'completed',
      conclusion: 'success',
      htmlUrl: `https://github.com/${repo}/actions/runs/12345678`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  public async getRunStatus(repo: string, runId: number): Promise<WorkflowRunSummary> {
    // Phase 01: Architectural interface definition.
    return {
      id: runId,
      name: 'Deploy Portfolio to GitHub Pages',
      headSha: 'scaffold_sha',
      status: 'completed',
      conclusion: 'success',
      htmlUrl: `https://github.com/${repo}/actions/runs/${runId}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
