import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { UploadR2Step } from '../../pipeline/steps/upload-r2.js';
import type { PipelineContext } from '../../pipeline/context.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import { PipelineStateStore } from '../../core/state/state-store.js';
import type { PipelineConfig } from '../../config/schema/index.js';
import type { R2Uploader, UploadResult } from '../../engines/r2/uploader.js';

describe('UploadR2Step Pipeline Unit Test', () => {
  const dummyConfig: PipelineConfig = {
    version: '1.0.0',
    portfolioPath: '../',
    productionUrl: 'https://pdp212.github.io/',
    git: { repository: 'test/repo', branch: 'main', requireCleanWorkingTree: true, disallowForcePush: true },
    r2: { bucket: 'test-bucket', publicBaseUrl: 'https://pub-test.r2.dev' },
    manifest: { relativeFilePath: 'data/work-manifest.json', atomicBackup: true },
    encoding: {
      container: 'mp4',
      videoCodec: 'libx264',
      audioCodec: 'aac',
      pixelFormat: 'yuv420p',
      crf: 18,
      preset: 'medium',
      profile: 'high',
      level: '4.2',
      audioBitrate: '192k',
      audioSampleRate: 48000,
      audioChannels: 2,
      fastStart: true,
      preserveResolution: true,
      preserveFrameRate: true,
      maxConcurrency: 1,
      allowOverwrite: false,
    },
    supportedInputFormats: ['.mp4'],
    outputFormat: '.mp4',
    directories: { temp: './temp', encoded: './encoded', completed: './completed', failed: './failed' },
    testCommands: [],
    timeout: { validationMs: 1000, encodingMs: 1000, uploadMs: 1000, verificationMs: 1000, githubActionsMs: 1000, smokeTestMs: 1000 },
    retryPolicy: { maxRetries: 3, initialDelayMs: 1000, backoffFactor: 2 },
  };

  const dummyEncodedFile = path.resolve('temp/upload_step_test.mp4');

  it('setup dummy encoded file', () => {
    fs.mkdirSync(path.dirname(dummyEncodedFile), { recursive: true });
    fs.writeFileSync(dummyEncodedFile, Buffer.from('FAKE_ENCODED_VIDEO_DATA_MP4'));
  });

  it('dry-run execution simulates upload without mutation', async () => {
    const logger = new PipelineLogger({ sink: () => {} });
    const context: PipelineContext = {
      pipelineId: 'pipe_dry_1',
      isDryRun: true,
      config: dummyConfig,
      logger,
      stateStore: new PipelineStateStore('pipe_dry_1'),
      currentStage: 'UPLOADING_R2',
      items: [
        {
          id: 'item_1',
          sourcePath: '/path/to/RAW.mov',
          filename: 'RAW.mov',
          tag: 'WED',
          name: 'WED_PHUNGTUONG',
          targetKey: 'WED_PHUNGTUONG.mp4',
          encodedLocalPath: dummyEncodedFile,
          status: 'ENCODED',
        },
      ],
    };

    const step = new UploadR2Step();
    const result = await step.execute(context);

    assert.equal(result.success, true);
    assert.equal(context.items[0].r2UploadStatus, 'UPLOADED');
    assert.equal(context.items[0].objectKey, 'WED_PHUNGTUONG.mp4');
    assert.equal(context.items[0].r2PublicUrl, 'https://pub-test.r2.dev/WED_PHUNGTUONG.mp4');
  });

  it('live execution with mock uploader sets all Section 17 fields on item', async () => {
    const logger = new PipelineLogger({ sink: () => {} });
    const context: PipelineContext = {
      pipelineId: 'pipe_live_1',
      isDryRun: false,
      config: dummyConfig,
      logger,
      stateStore: new PipelineStateStore('pipe_live_1'),
      currentStage: 'UPLOADING_R2',
      items: [
        {
          id: 'item_2',
          sourcePath: '/path/to/RAW2.mov',
          filename: 'RAW2.mov',
          tag: 'EVENT',
          name: 'EVENT_GALA',
          targetKey: 'EVENT_GALA.mp4',
          encodedLocalPath: dummyEncodedFile,
          status: 'ENCODED',
        },
      ],
    };

    const mockUploader: R2Uploader = {
      upload: async (filePath, key, contentType) => {
        return {
          localPath: filePath,
          fileName: path.basename(filePath),
          objectKey: key,
          publicUrl: `https://pub-test.r2.dev/${key}`,
          size: 12345,
          contentType: contentType || 'video/mp4',
          status: 'UPLOADED',
          etag: 'mock_etag_live',
        };
      },
      uploadMany: async () => [],
    };

    const step = new UploadR2Step(mockUploader);
    const result = await step.execute(context);

    assert.equal(result.success, true);
    const item = context.items[0];
    assert.equal(item.status, 'UPLOADED');
    assert.equal(item.r2UploadStatus, 'UPLOADED');
    assert.equal(item.objectKey, 'EVENT_GALA.mp4');
    assert.equal(item.fileName, path.basename(dummyEncodedFile));
    assert.equal(item.localEncodedPath, dummyEncodedFile);
    assert.equal(item.r2PublicUrl, 'https://pub-test.r2.dev/EVENT_GALA.mp4');
  });

  it('cleanup dummy encoded file', () => {
    try {
      fs.unlinkSync(dummyEncodedFile);
    } catch {}
  });
});
