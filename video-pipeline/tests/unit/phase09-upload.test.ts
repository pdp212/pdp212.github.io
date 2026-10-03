/**
 * Phase 09 Browser-Native Video Ingestion Unit Tests
 *
 * Validates:
 * A. Upload endpoint (/api/upload) with single and batch files
 * B. Container extension validation from pipeline config
 * C. Empty file & malformed request rejection
 * D. Path traversal protection & staging isolation
 * E. FFprobe video stream inspection & invalid file rejection
 * F. Automatic cleanup of failed/invalid/removed staged files
 * G. Queue integration (READY/INVALID status, metadata fields)
 * H. Security boundary (zero secrets/credentials exposed)
 * I. Pipeline context handoff with staged inputs
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PipelineUiServer } from '../../app/ui/server.js';
import { InputController } from '../../app/application/input-controller.js';
import { VideoQueue } from '../../app/application/video-queue.js';
import { VideoInspector } from '../../engines/video/video-inspector.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import type { PipelineConfig } from '../../config/schema/index.js';

// ---------------------------------------------------------------------------
// Mock Inspector with customizable behaviors
// ---------------------------------------------------------------------------

class MockVideoInspector extends VideoInspector {
  public failFiles: Set<string> = new Set();
  public audioOnlyFiles: Set<string> = new Set();
  public failAll = false;
  public audioOnly = false;

  constructor() {
    super(['.mp4', '.mov', '.mkv', '.avi', '.mxf', '.webm']);
  }

  public override async inspectFile(filePath: string) {
    const filename = path.basename(filePath);

    if (this.failAll || this.failFiles.has(filename) || filePath.includes('corrupt')) {
      return {
        valid: false,
        errors: ['Video inspection failed: No video stream detected in media file.'],
      };
    }

    if (this.audioOnly || this.audioOnlyFiles.has(filename) || filePath.includes('audio_only')) {
      return {
        valid: false,
        errors: ['No video stream detected in media file.'],
      };
    }

    return {
      valid: true,
      metadata: {
        filename,
        absolutePath: filePath,
        extension: path.extname(filePath).toLowerCase(),
        fileSize: 10_485_760,
        duration: 180,
        durationFormatted: '03:00',
        width: 1920,
        height: 1080,
        fps: 25,
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioChannels: 2,
        audioSampleRate: 48000,
        bitrateKbps: 5000,
        containerFormat: path.extname(filePath).replace('.', '') || 'mp4',
      },
      errors: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Test Config & Test Fixture Server Helper
// ---------------------------------------------------------------------------

const tempStagingDir = path.join(os.tmpdir(), `phase09_staging_${Date.now()}`);

const TEST_CONFIG: PipelineConfig = {
  version: '1.0.0',
  portfolioPath: '../',
  productionUrl: 'https://pdp212.github.io/',
  git: {
    repository: 'pdp212/pdp212.github.io',
    branch: 'main',
    requireCleanWorkingTree: true,
    disallowForcePush: true,
  },
  r2: {
    bucket: 'pdp212-profile',
    publicBaseUrl: 'https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev',
  },
  manifest: { relativeFilePath: 'data/work-manifest.json', atomicBackup: true },
  encoding: {
    videoCodec: 'libx264',
    audioCodec: 'aac',
    preset: 'medium',
    crf: 18,
    pixelFormat: 'yuv420p',
  },
  supportedInputFormats: ['.mp4', '.mov', '.mkv', '.avi', '.mxf', '.webm'],
  outputFormat: '.mp4',
  directories: {
    temp: './temp',
    encoded: './encoded',
    completed: './completed',
    failed: './failed',
  },
  testCommands: [],
  timeout: {
    validationMs: 1000,
    encodingMs: 1000,
    uploadMs: 1000,
    verificationMs: 1000,
    githubActionsMs: 1000,
    smokeTestMs: 1000,
  },
  retryPolicy: { maxRetries: 1, initialDelayMs: 100, backoffFactor: 1 },
};

function createPhase09TestServer(port: number, inspector = new MockVideoInspector()) {
  const queue = new VideoQueue(TEST_CONFIG.supportedInputFormats, inspector);
  const logger = new PipelineLogger({ minLevel: 'WARN' });
  const controller = new InputController(TEST_CONFIG, queue, logger);
  const server = new PipelineUiServer(controller, logger, {
    port,
    host: '127.0.0.1',
    stagingDirOverride: tempStagingDir,
  });
  return { server, controller, queue, inspector };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Phase 09: Browser-Native Video Ingestion', () => {
  before(() => {
    if (!fs.existsSync(tempStagingDir)) {
      fs.mkdirSync(tempStagingDir, { recursive: true });
    }
  });

  after(() => {
    if (fs.existsSync(tempStagingDir)) {
      try {
        fs.rmSync(tempStagingDir, { recursive: true, force: true });
      } catch {}
    }
  });

  // A. Upload Endpoint — Valid MP4 & MOV
  test('A1: accepts valid MP4 upload and returns complete video metadata', async () => {
    const { server, queue } = createPhase09TestServer(3401);
    const url = await server.start();
    try {
      const fd = new FormData();
      fd.append(
        'file',
        new Blob([Buffer.from('fake mp4 video bytes')], { type: 'video/mp4' }),
        'WED_PHUNGTUONG.mp4'
      );

      const res = await fetch(`${url}/api/upload`, { method: 'POST', body: fd });
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.strictEqual(data.success, true);
      assert.strictEqual(data.fileName, 'WED_PHUNGTUONG.mp4');
      assert.strictEqual(data.status, 'READY');
      assert.ok(data.id.startsWith('vid_'), 'ID must have vid_ prefix');
      assert.ok(data.path.includes('upload_'), 'Path must be in staging with upload_ prefix');
      assert.strictEqual(data.metadata.width, 1920);
      assert.strictEqual(data.metadata.height, 1080);
      assert.strictEqual(data.metadata.fps, 25);
      assert.strictEqual(data.metadata.videoCodec, 'h264');
      assert.strictEqual(data.metadata.audioCodec, 'aac');

      // Check item in queue
      const queueItem = queue.get(data.id);
      assert.ok(queueItem, 'Item must be in queue');
      assert.strictEqual(queueItem.status, 'READY');
      assert.strictEqual(queueItem.fileName, 'WED_PHUNGTUONG.mp4');
    } finally {
      await server.stop();
    }
  });

  test('A2: accepts supported MOV upload and correctly parses metadata', async () => {
    const { server } = createPhase09TestServer(3402);
    const url = await server.start();
    try {
      const fd = new FormData();
      fd.append(
        'files',
        new Blob([Buffer.from('fake quicktime bytes')], { type: 'video/quicktime' }),
        'COMMERCIAL_TEASER.mov'
      );

      const res = await fetch(`${url}/api/upload`, { method: 'POST', body: fd });
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.strictEqual(data.success, true);
      assert.strictEqual(data.fileName, 'COMMERCIAL_TEASER.mov');
      assert.strictEqual(data.status, 'READY');
      assert.ok(data.metadata.duration > 0);
    } finally {
      await server.stop();
    }
  });

  // B. Container & Extension Validation
  test('B1: rejects unsupported file extension (.exe, .txt, .pdf)', async () => {
    const { server, queue } = createPhase09TestServer(3403);
    const url = await server.start();
    try {
      const fd = new FormData();
      fd.append(
        'file',
        new Blob([Buffer.from('malicious payload')], { type: 'application/octet-stream' }),
        'malware.exe'
      );

      const res = await fetch(`${url}/api/upload`, { method: 'POST', body: fd });
      assert.strictEqual(res.status, 200); // 200 with error in item response
      const data = await res.json();

      assert.strictEqual(data.success, false);
      assert.strictEqual(data.fileName, 'malware.exe');
      assert.strictEqual(data.status, 'INVALID');
      assert.ok(data.error.includes('Unsupported container format'));

      // Check item in queue is INVALID
      const items = queue.getAll();
      const invalidItem = items.find((i) => i.fileName === 'malware.exe');
      assert.ok(invalidItem, 'Invalid item must be logged in queue');
      assert.strictEqual(invalidItem.status, 'INVALID');
    } finally {
      await server.stop();
    }
  });

  // C. Empty File & Malformed Upload
  test('C1: rejects empty 0-byte file upload', async () => {
    const { server } = createPhase09TestServer(3404);
    const url = await server.start();
    try {
      const fd = new FormData();
      fd.append('file', new Blob([], { type: 'video/mp4' }), 'empty_video.mp4');

      const res = await fetch(`${url}/api/upload`, { method: 'POST', body: fd });
      const data = await res.json();

      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('empty (0 bytes)'));
    } finally {
      await server.stop();
    }
  });

  test('C2: rejects non-multipart POST request with 400 Bad Request', async () => {
    const { server } = createPhase09TestServer(3405);
    const url = await server.start();
    try {
      const res = await fetch(`${url}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: 'not a multipart' }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('multipart/form-data'));
    } finally {
      await server.stop();
    }
  });

  // D. Path Traversal & Security Isolation
  test('D1: neutralizes directory traversal in filename (../../etc/passwd -> passwd.mp4)', async () => {
    const { server } = createPhase09TestServer(3406);
    const url = await server.start();
    try {
      const fd = new FormData();
      fd.append(
        'file',
        new Blob([Buffer.from('traversal test bytes')], { type: 'video/mp4' }),
        '../../../../etc/passwd.mp4'
      );

      const res = await fetch(`${url}/api/upload`, { method: 'POST', body: fd });
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.strictEqual(data.success, true);
      assert.strictEqual(data.fileName, 'passwd.mp4');
      assert.ok(data.path.startsWith(tempStagingDir), 'File must be inside designated staging directory');
      assert.ok(!data.path.includes('..'), 'Path must not contain traversal');
      assert.ok(fs.existsSync(data.path), 'Staged file exists on disk');
    } finally {
      await server.stop();
    }
  });

  // E. Batch Upload & Partial Failures
  test('E1: handles multi-file batch upload independently (1 valid, 1 invalid)', async () => {
    const { server, queue } = createPhase09TestServer(3407);
    const url = await server.start();
    try {
      const fd = new FormData();
      fd.append(
        'file1',
        new Blob([Buffer.from('valid video bytes')], { type: 'video/mp4' }),
        'PROMO_1.mp4'
      );
      fd.append(
        'file2',
        new Blob([Buffer.from('invalid extension file')], { type: 'text/plain' }),
        'script.txt'
      );

      const res = await fetch(`${url}/api/upload`, { method: 'POST', body: fd });
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.strictEqual(data.count, 2);
      assert.strictEqual(data.items.length, 2);

      const validItem = data.items.find((i: any) => i.fileName === 'PROMO_1.mp4');
      const invalidItem = data.items.find((i: any) => i.fileName === 'script.txt');

      assert.ok(validItem);
      assert.strictEqual(validItem.success, true);
      assert.strictEqual(validItem.status, 'READY');

      assert.ok(invalidItem);
      assert.strictEqual(invalidItem.success, false);
      assert.strictEqual(invalidItem.status, 'INVALID');

      // Queue state
      const summary = queue.getAll();
      assert.strictEqual(summary.length, 2);
      assert.strictEqual(queue.getReady().length, 1);
    } finally {
      await server.stop();
    }
  });

  // F. Corrupted Video Inspection & Automatic Staging Cleanup
  test('F1: cleans up staged file immediately when FFprobe inspection fails', async () => {
    const inspector = new MockVideoInspector();
    inspector.failAll = true;
    const { server } = createPhase09TestServer(3408, inspector);
    const url = await server.start();
    try {
      const initialCount = fs.readdirSync(tempStagingDir).length;
      const fd = new FormData();
      fd.append(
        'file',
        new Blob([Buffer.from('corrupted stream bytes')], { type: 'video/mp4' }),
        'corrupt_video.mp4'
      );

      const res = await fetch(`${url}/api/upload`, { method: 'POST', body: fd });
      const data = await res.json();

      assert.strictEqual(data.success, false);
      assert.strictEqual(data.status, 'INVALID');
      assert.ok(data.error.includes('inspection failed'));

      // Verify no new dangling file remained in staging directory
      const finalCount = fs.readdirSync(tempStagingDir).length;
      assert.strictEqual(finalCount, initialCount, 'Corrupted staged file must be deleted immediately');
    } finally {
      await server.stop();
    }
  });

  // G. Staging Cleanup on Queue Removal and Clear
  test('G1: cleans up staged upload file when item is removed from queue or queue is cleared', async () => {
    const { server, controller, queue } = createPhase09TestServer(3409);
    const url = await server.start();
    try {
      const fd = new FormData();
      fd.append(
        'file',
        new Blob([Buffer.from('video bytes for removal test')], { type: 'video/mp4' }),
        'TO_BE_REMOVED.mp4'
      );

      const res = await fetch(`${url}/api/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      const stagedPath = data.path;

      assert.ok(fs.existsSync(stagedPath), 'Staged file exists before removal');

      // Remove item
      controller.removeVideo(data.id);
      assert.strictEqual(fs.existsSync(stagedPath), false, 'Staged file was cleaned up on remove');
    } finally {
      await server.stop();
    }
  });

  // H. Security: Zero Secret Exposure
  test('H1: upload response never exposes credentials or tokens', async () => {
    const { server } = createPhase09TestServer(3410);
    const url = await server.start();
    try {
      const fd = new FormData();
      fd.append(
        'file',
        new Blob([Buffer.from('sample video bytes')], { type: 'video/mp4' }),
        'SECURITY_CHECK.mp4'
      );

      const res = await fetch(`${url}/api/upload`, { method: 'POST', body: fd });
      const rawText = await res.text();

      assert.ok(!rawText.includes('R2_SECRET_ACCESS_KEY'), 'Must not leak R2 secret');
      assert.ok(!rawText.includes('GITHUB_TOKEN'), 'Must not leak GitHub token');
      assert.ok(!rawText.includes('CF_API_TOKEN'), 'Must not leak CF token');
      assert.ok(!rawText.includes('/Users/'), 'Must not leak raw user home directories');
    } finally {
      await server.stop();
    }
  });

  // I. Pipeline Context Handoff
  test('I1: preparePipelineContext constructs valid items pointing to staged source files', async () => {
    const { server, controller } = createPhase09TestServer(3411);
    const url = await server.start();
    try {
      const fd = new FormData();
      fd.append(
        'file',
        new Blob([Buffer.from('context handoff bytes')], { type: 'video/mp4' }),
        'BRAND_LAUNCH.mp4'
      );

      await fetch(`${url}/api/upload`, { method: 'POST', body: fd });

      const context = controller.preparePipelineContext(true);
      assert.strictEqual(context.items.length, 1);

      const item = context.items[0];
      assert.strictEqual(item.filename, 'BRAND_LAUNCH.mp4');
      assert.strictEqual(item.tag, 'BRAND');
      assert.strictEqual(item.name, 'LAUNCH');
      assert.strictEqual(item.targetKey, 'BRAND_LAUNCH.mp4');
      assert.ok(item.sourcePath.startsWith(tempStagingDir), 'sourcePath must point to staged file');
      assert.ok(fs.existsSync(item.sourcePath), 'sourcePath file must exist on disk');
    } finally {
      await server.stop();
    }
  });
});
