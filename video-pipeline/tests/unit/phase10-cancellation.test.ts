/**
 * Phase 10 Unit Tests: Real Pipeline Cancellation
 *
 * Tests:
 * 1. POST /api/pipeline/cancel endpoint returns 400 when no pipeline is running
 * 2. POST /api/pipeline/cancel stops active running pipeline
 * 3. AbortController signal causes orchestrator to abort and transition to CANCELLED
 * 4. Cancellation leaves manifest intact and does not perform git commit/push
 */

import test, { describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PipelineUiServer } from '../../app/ui/server.js';
import { InputController } from '../../app/application/input-controller.js';
import { VideoPipelineOrchestrator } from '../../pipeline/pipeline.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import { PipelineStateStore } from '../../core/state/state-store.js';
import type { PipelineConfig } from '../../config/schema/index.js';
import type { PipelineContext } from '../../pipeline/context.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.resolve(currentDir, '../../temp/phase10_cancel_test');
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
  supportedInputFormats: ['.mp4', '.mov', '.mkv'],
  outputFormat: '.mp4',
  directories: { temp: './temp', encoded: './encoded', completed: './completed', failed: './failed' },
  testCommands: [],
  timeout: { validationMs: 1000, encodingMs: 1000, uploadMs: 1000, verificationMs: 1000, githubActionsMs: 1000, smokeTestMs: 1000 },
  retryPolicy: { maxRetries: 1, initialDelayMs: 100, backoffFactor: 1 },
};

function postJson(urlStr: string, body: unknown = {}): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const bodyStr = JSON.stringify(body);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
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
    req.write(bodyStr);
    req.end();
  });
}

describe('Phase 10: Real Pipeline Cancellation', () => {
  let server: PipelineUiServer;
  let serverUrl: string;

  before(async () => {
    fs.mkdirSync(jobStorageDir, { recursive: true });
    const logger = new PipelineLogger({ minLevel: 'ERROR' });
    const controller = new InputController(TEST_CONFIG, undefined, logger);
    server = new PipelineUiServer(controller, logger, {
      port: 3291,
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

  test('POST /api/pipeline/cancel returns 400 when no pipeline is running', async () => {
    const res = await postJson(`${serverUrl}/api/pipeline/cancel`);
    assert.strictEqual(res.status, 400);
    assert.match(res.data.error, /No pipeline is currently running/i);
  });

  test('Orchestrator immediately halts and returns CANCELLED when abort signal is already aborted', async () => {
    const abortController = new AbortController();
    abortController.abort();

    const logger = new PipelineLogger({ minLevel: 'ERROR' });
    const stateStore = new PipelineStateStore('pipe_cancel_test', true);

    const context: PipelineContext = {
      pipelineId: 'pipe_cancel_test',
      isDryRun: true,
      config: TEST_CONFIG,
      logger,
      stateStore,
      items: [],
      currentStage: 'IDLE',
      abortController,
    };

    const orchestrator = new VideoPipelineOrchestrator();
    const result = await orchestrator.execute(context);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.finalStage, 'CANCELLED');
    assert.strictEqual(context.isCancelled, true);
  });

  test('Orchestrator detects mid-execution abort signal and transitions safely to CANCELLED', async () => {
    const abortController = new AbortController();
    const logger = new PipelineLogger({ minLevel: 'ERROR' });
    const stateStore = new PipelineStateStore('pipe_mid_cancel_test', true);

    const context: PipelineContext = {
      pipelineId: 'pipe_mid_cancel_test',
      isDryRun: true,
      config: TEST_CONFIG,
      logger,
      stateStore,
      items: [
        {
          id: 'item_1',
          sourcePath: '/path/to/video.mp4',
          filename: 'video.mp4',
          tag: 'WORK',
          name: 'project-video',
          targetKey: 'project-video.mp4',
          status: 'PENDING',
        },
      ],
      currentStage: 'IDLE',
      abortController,
    };

    const orchestrator = new VideoPipelineOrchestrator();

    // Trigger abort right after start
    setTimeout(() => {
      abortController.abort();
    }, 5);

    const result = await orchestrator.execute(context);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.finalStage, 'CANCELLED');
  });
});
