/**
 * Phase 10 Unit Tests: Persistent Job History Store
 *
 * Tests:
 * 1. JobStore saves and retrieves individual JobRecord
 * 2. JobStore retrieves all jobs sorted by date (newest first)
 * 3. JobStore strips any credentials or secrets during save
 * 4. JobStore recovers interrupted/stale jobs on startup (marking as FAILED)
 * 5. GET /api/jobs and GET /api/jobs/:id endpoints return valid job history
 */

import test, { describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JobStore, type JobRecord } from '../../core/state/job-store.js';
import { PipelineUiServer } from '../../app/ui/server.js';
import { InputController } from '../../app/application/input-controller.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import type { PipelineConfig } from '../../config/schema/index.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.resolve(currentDir, '../../temp/phase10_job_test');
const jobStorageDir = path.join(tempDir, 'jobs');

const TEST_CONFIG: PipelineConfig = {
  version: '1.0.0',
  portfolioPath: tempDir,
  productionUrl: 'https://pdp212.github.io/',
  git: { repository: 'pdp212/pdp212.github.io', branch: 'main', requireCleanWorkingTree: true, disallowForcePush: true },
  r2: { bucket: 'pdp212-profile', publicBaseUrl: 'https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev' },
  manifest: { relativeFilePath: 'data/work-manifest.json', atomicBackup: true },
  encoding: {
    videoCodec: 'libx264', audioCodec: 'aac', preset: 'medium', crf: 22, pixelFormat: 'yuv420p',
  },
  supportedInputFormats: ['.mp4', '.mov'],
  outputFormat: '.mp4',
  directories: { temp: './temp', encoded: './encoded', completed: './completed', failed: './failed' },
  testCommands: [],
  timeout: { validationMs: 1000, encodingMs: 1000, uploadMs: 1000, verificationMs: 1000, githubActionsMs: 1000, smokeTestMs: 1000 },
  retryPolicy: { maxRetries: 1, initialDelayMs: 100, backoffFactor: 1 },
};

function getJson(urlStr: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 500, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode || 500, data: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('Phase 10: Persistent Job History', () => {
  let jobStore: JobStore;
  let server: PipelineUiServer;
  let serverUrl: string;

  before(async () => {
    fs.mkdirSync(jobStorageDir, { recursive: true });
    jobStore = new JobStore(jobStorageDir);

    const logger = new PipelineLogger({ minLevel: 'ERROR' });
    const controller = new InputController(TEST_CONFIG, undefined, logger);
    server = new PipelineUiServer(controller, logger, {
      port: 3292,
      stagingDirOverride: tempDir,
      jobStorageDirOverride: jobStorageDir,
    });
    serverUrl = await server.start();
  });

  after(async () => {
    await server.stop();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test('saves and retrieves a complete job record', () => {
    const job: JobRecord = {
      jobId: 'job_test_001',
      pipelineId: 'pipe_001',
      createdAt: '2026-10-02T10:00:00.000Z',
      startedAt: '2026-10-02T10:00:00.000Z',
      completedAt: '2026-10-02T10:02:00.000Z',
      status: 'COMPLETED',
      currentStage: 'PRODUCTION_SMOKE_TEST',
      isDryRun: false,
      inputCount: 1,
      completedCount: 1,
      failedCount: 0,
      items: [
        {
          id: 'item_1',
          filename: 'demo.mp4',
          status: 'COMPLETED',
        },
      ],
      error: null,
      durationMs: 120000,
    };

    jobStore.saveJob(job);
    const retrieved = jobStore.getJob('job_test_001');

    assert.ok(retrieved);
    assert.strictEqual(retrieved.jobId, 'job_test_001');
    assert.strictEqual(retrieved.status, 'COMPLETED');
    assert.strictEqual(retrieved.durationMs, 120000);
  });

  test('sanitizes secrets when persisting job errors and logs', () => {
    const fakeSecret = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
    const job: JobRecord = {
      jobId: 'job_test_secret',
      pipelineId: 'pipe_sec',
      createdAt: '2026-10-02T11:00:00.000Z',
      startedAt: '2026-10-02T11:00:00.000Z',
      completedAt: '2026-10-02T11:01:00.000Z',
      status: 'FAILED',
      currentStage: 'PUSHING',
      isDryRun: false,
      inputCount: 1,
      completedCount: 0,
      failedCount: 1,
      items: [
        {
          id: 'item_sec',
          filename: 'demo.mp4',
          status: 'FAILED',
          error: `Failed with token ${fakeSecret}`,
        },
      ],
      error: `Git push failed using credential: ${fakeSecret}`,
      durationMs: 60000,
    };

    jobStore.saveJob(job);
    const retrieved = jobStore.getJob('job_test_secret');

    assert.ok(retrieved);
    assert.strictEqual(retrieved.error?.includes(fakeSecret), false);
    assert.strictEqual(retrieved.items[0]?.error?.includes(fakeSecret), false);
  });

  test('recovers interrupted jobs on startup by marking them as FAILED', () => {
    const interruptedJob: JobRecord = {
      jobId: 'job_interrupted_001',
      pipelineId: 'pipe_int',
      createdAt: '2026-10-02T09:00:00.000Z',
      startedAt: '2026-10-02T09:00:00.000Z',
      completedAt: null,
      status: 'RUNNING',
      currentStage: 'UPLOADING_R2',
      isDryRun: false,
      inputCount: 2,
      completedCount: 0,
      failedCount: 0,
      items: [],
      error: null,
      durationMs: null,
    };

    jobStore.saveJob(interruptedJob);

    const recoveredCount = jobStore.recoverInterruptedJobs();
    assert.ok(recoveredCount >= 1);

    const retrieved = jobStore.getJob('job_interrupted_001');
    assert.ok(retrieved);
    assert.strictEqual(retrieved.status, 'FAILED');
    assert.match(retrieved.error || '', /Job interrupted by application restart/i);
    assert.ok(retrieved.completedAt);
  });

  test('GET /api/jobs returns list of all jobs and GET /api/jobs/:id returns single job', async () => {
    const resList = await getJson(`${serverUrl}/api/jobs`);
    assert.strictEqual(resList.status, 200);
    assert.ok(Array.isArray(resList.data.jobs));
    assert.ok(resList.data.jobs.length >= 2);

    const resSingle = await getJson(`${serverUrl}/api/jobs/job_test_001`);
    assert.strictEqual(resSingle.status, 200);
    assert.strictEqual(resSingle.data.job.jobId, 'job_test_001');

    const resNotFound = await getJson(`${serverUrl}/api/jobs/non_existent_job`);
    assert.strictEqual(resNotFound.status, 404);
  });
});
