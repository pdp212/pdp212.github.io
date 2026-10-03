/**
 * Persistent Job History Store
 * Records, updates, and recovers pipeline execution history on disk.
 * Strictly zero credentials or secrets are ever persisted.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { PipelineStage } from '../errors/pipeline-errors.js';
import { SecretSanitizer } from '../security/secret-sanitizer.js';

export type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface JobItemSummary {
  id: string;
  filename: string;
  tag?: string;
  name?: string;
  status: string;
  size?: number;
  error?: string;
}

export interface JobRecord {
  jobId: string;
  pipelineId: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  status: JobStatus;
  currentStage: PipelineStage;
  isDryRun: boolean;
  inputCount: number;
  completedCount: number;
  failedCount: number;
  items: JobItemSummary[];
  error: string | null;
  durationMs: number | null;
}

export class JobStore {
  private readonly storageDir: string;

  constructor(storageDirOverride?: string) {
    this.storageDir = storageDirOverride
      ? path.resolve(storageDirOverride)
      : path.resolve(process.cwd(), 'data/jobs');
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  private getJobPath(jobId: string): string {
    const cleanId = path.basename(jobId).replace(/[^a-zA-Z0-9_-]/g, '');
    return path.join(this.storageDir, `${cleanId}.json`);
  }

  public saveJob(job: JobRecord): void {
    this.ensureDirectory();
    const sanitizedJob: JobRecord = {
      ...job,
      error: job.error ? SecretSanitizer.sanitizeString(job.error) : null,
      items: job.items.map((i) => ({
        ...i,
        error: i.error ? SecretSanitizer.sanitizeString(i.error) : undefined,
      })),
    };

    const filePath = this.getJobPath(job.jobId);
    const tempPath = `${filePath}.tmp_${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(sanitizedJob, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  }

  public getJob(jobId: string): JobRecord | undefined {
    try {
      const filePath = this.getJobPath(jobId);
      if (!fs.existsSync(filePath)) return undefined;
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as JobRecord;
    } catch {
      return undefined;
    }
  }

  public getAllJobs(): JobRecord[] {
    this.ensureDirectory();
    try {
      const files = fs.readdirSync(this.storageDir).filter((f) => f.endsWith('.json'));
      const jobs: JobRecord[] = [];

      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(this.storageDir, file), 'utf-8');
          const job = JSON.parse(raw) as JobRecord;
          if (job && job.jobId) {
            jobs.push(job);
          }
        } catch {
          // Ignore corrupted single record
        }
      }

      // Sort newest first
      return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  }

  /**
   * Scans job directory on startup and marks any incomplete jobs (RUNNING/QUEUED) as FAILED.
   */
  public recoverInterruptedJobs(): number {
    const jobs = this.getAllJobs();
    let recoveredCount = 0;

    for (const job of jobs) {
      if (job.status === 'RUNNING' || job.status === 'QUEUED') {
        job.status = 'FAILED';
        job.completedAt = new Date().toISOString();
        job.error = 'Job interrupted by application restart or unexpected termination.';
        this.saveJob(job);
        recoveredCount++;
      }
    }

    return recoveredCount;
  }
}
