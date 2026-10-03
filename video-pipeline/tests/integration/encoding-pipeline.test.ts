/**
 * Integration Test: End-to-End Delivery Pipeline Execution
 * Verifies that the pipeline validates source artifacts and executes delivery to R2 without transcoding.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { VideoPipelineOrchestrator } from '../../pipeline/pipeline.js';
import { ValidateStep } from '../../pipeline/steps/validate.js';
import { UploadR2Step } from '../../pipeline/steps/upload-r2.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import { PipelineStateStore } from '../../core/state/state-store.js';
import type { PipelineContext } from '../../pipeline/context.js';
import type { PipelineConfig } from '../../config/schema/index.js';
import type { R2Uploader, UploadProgress, UploadResult } from '../../engines/r2/uploader.js';

class MockR2Uploader implements R2Uploader {
  public uploadedFiles: Array<{ filePath: string; key: string; contentType?: string }> = [];

  public async upload(
    filePath: string,
    key: string,
    contentType?: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    this.uploadedFiles.push({ filePath, key, contentType });
    if (onProgress) {
      onProgress({ bytesLoaded: 1000, totalBytes: 1000, percent: 100 });
    }
    return {
      localPath: filePath,
      fileName: path.basename(filePath),
      objectKey: key,
      publicUrl: `https://cdn.dev/${key}`,
      size: 1000,
      contentType: contentType || 'video/mp4',
      status: 'UPLOADED',
    };
  }

  public async uploadMany(
    items: Array<{ filePath: string; key: string; contentType?: string }>,
    onProgress?: (index: number, total: number, progress: UploadProgress) => void
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];
    for (let i = 0; i < items.length; i++) {
      const res = await this.upload(items[i].filePath, items[i].key, items[i].contentType);
      results.push(res);
      if (onProgress) {
        onProgress(i + 1, items.length, { bytesLoaded: 1000, totalBytes: 1000, percent: 100 });
      }
    }
    return results;
  }
}

describe('Delivery Pipeline Integration', () => {
  const baseConfig: PipelineConfig = {
    version: '1.0.0',
    portfolioPath: '../',
    productionUrl: 'https://pdp212.github.io/',
    git: { repository: 'repo', branch: 'main', requireCleanWorkingTree: true, disallowForcePush: true },
    r2: { bucket: 'b', publicBaseUrl: 'https://cdn.dev' },
    manifest: { relativeFilePath: 'manifest.json', atomicBackup: true },
    supportedInputFormats: ['.mp4', '.mov', '.mkv', '.webm'],
    directories: { temp: './temp', completed: './completed', failed: './failed' },
    testCommands: [],
    timeout: { validationMs: 1000, uploadMs: 1000, verificationMs: 1000, githubActionsMs: 1000, smokeTestMs: 1000 },
    retryPolicy: { maxRetries: 1, initialDelayMs: 1, backoffFactor: 1 },
  };

  test('executes VALIDATING -> UPLOADING_R2 and preserves original format/bytes without transcoding', async () => {
    const logger = new PipelineLogger({ minLevel: 'WARN' });
    const stateStore = new PipelineStateStore('test_int', false);

    const tempTestFile = path.resolve(process.cwd(), 'temp/test_delivery_sample.mov');
    fs.mkdirSync(path.dirname(tempTestFile), { recursive: true });
    fs.writeFileSync(tempTestFile, 'sample raw video bytes from davinci resolve');

    const context: PipelineContext = {
      pipelineId: 'test_int',
      isDryRun: false,
      config: baseConfig,
      logger,
      stateStore,
      items: [
        {
          id: 'int_item_1',
          sourcePath: tempTestFile,
          filename: 'WED_SAMPLE.mov',
          tag: 'WED',
          name: 'SAMPLE',
          targetKey: 'WED_SAMPLE.mov',
          sourceMetadata: {
            width: 1920,
            height: 1080,
            durationSeconds: 60,
            bitrateKbps: 4500,
            codec: 'prores',
            hasAudio: true,
            sizeBytes: 1000,
          },
          status: 'PENDING',
        },
      ],
      currentStage: 'IDLE',
    };

    const mockUploader = new MockR2Uploader();
    const orchestrator = new VideoPipelineOrchestrator([
      new ValidateStep(),
      new UploadR2Step(mockUploader),
    ]);

    const result = await orchestrator.execute(context, 'UPLOADING_R2');

    try {
      assert.strictEqual(result.success, true);
      assert.strictEqual(context.items[0].status, 'UPLOADED');
      assert.strictEqual(mockUploader.uploadedFiles.length, 1);
      assert.strictEqual(mockUploader.uploadedFiles[0].filePath, tempTestFile);
      assert.strictEqual(mockUploader.uploadedFiles[0].key, 'WED_SAMPLE.mov');
      assert.strictEqual(mockUploader.uploadedFiles[0].contentType, 'video/quicktime');

      assert.strictEqual(result.results.length, 2);
      assert.strictEqual(result.results[0].stage, 'VALIDATING');
      assert.strictEqual(result.results[1].stage, 'UPLOADING_R2');
    } finally {
      if (fs.existsSync(tempTestFile)) {
        fs.unlinkSync(tempTestFile);
      }
    }
  });
});
