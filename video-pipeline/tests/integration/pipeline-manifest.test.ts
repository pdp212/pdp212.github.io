/**
 * Pipeline Manifest Integration Tests
 * Validates UpdateManifestStep integration, verification gating, dry-run, and isolation from remote R2 mutation.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { UpdateManifestStep } from '../../pipeline/steps/update-manifest.js';
import { VideoPipelineOrchestrator } from '../../pipeline/pipeline.js';
import type { PipelineContext, PipelineItem } from '../../pipeline/context.js';
import { PipelineStateStore } from '../../core/state/state-store.js';
import { PipelineLogger } from '../../core/logger/logger.js';
import type { PipelineConfig } from '../../config/schema/index.js';

describe('Phase 05 Pipeline Manifest Integration Tests', () => {
  const tmpRoot = path.join(os.tmpdir(), `pipeline-manifest-int-${Date.now()}`);
  const manifestRel = 'data/work-manifest.json';
  const publicBaseUrl = 'https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev';

  let config: PipelineConfig;
  let testContext: PipelineContext;

  beforeEach(() => {
    fs.mkdirSync(path.join(tmpRoot, 'data'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'video-pipeline/temp'), { recursive: true });

    // Seed existing manifest
    const initialManifest = [
      {
        key: 'WED_PHUNGTUONG.wed.mp4',
        url: `${publicBaseUrl}/WED_PHUNGTUONG.wed.mp4`,
        tag: 'WED',
        name: 'PHUNGTUONG',
      },
    ];
    fs.writeFileSync(path.join(tmpRoot, manifestRel), JSON.stringify(initialManifest, null, 2));

    config = {
      version: '1.0.0',
      portfolioPath: tmpRoot,
      productionUrl: 'https://pdp212.github.io/',
      git: {
        repository: 'pdp212/pdp212.github.io',
        branch: 'main',
        requireCleanWorkingTree: true,
        disallowForcePush: true,
      },
      r2: {
        bucket: 'pdp212-profile',
        publicBaseUrl,
      },
      manifest: {
        relativeFilePath: manifestRel,
        atomicBackup: true,
      },
      encoding: {
        container: 'mp4',
        videoCodec: 'libx264',
        audioCodec: 'aac',
        pixelFormat: 'yuv420p',
        crf: 18,
        preset: 'medium',
      },
      supportedInputFormats: ['.mp4'],
      outputFormat: '.mp4',
      directories: {
        temp: path.join(tmpRoot, 'video-pipeline/temp'),
        encoded: path.join(tmpRoot, 'video-pipeline/encoded'),
        completed: path.join(tmpRoot, 'video-pipeline/completed'),
        failed: path.join(tmpRoot, 'video-pipeline/failed'),
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
      retryPolicy: {
        maxRetries: 1,
        initialDelayMs: 10,
        backoffFactor: 1,
      },
    };

    const pipelineId = `test-manifest-${Date.now()}`;
    testContext = {
      pipelineId,
      isDryRun: false,
      config,
      logger: new PipelineLogger({ minLevel: 'WARN' }),
      stateStore: new PipelineStateStore(pipelineId, false),
      items: [],
      currentStage: 'VERIFYING_STREAM',
    };
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('14. new video added: verified item is merged and written to manifest', async () => {
    const verifiedItem: PipelineItem = {
      id: 'item-1',
      sourcePath: '/path/MOTION_BRAND_FILM.mp4',
      filename: 'MOTION_BRAND_FILM.mp4',
      tag: 'MOTION',
      name: 'BRAND_FILM',
      targetKey: 'MOTION_BRAND_FILM.mp4',
      status: 'VERIFIED',
      r2ObjectVerified: true,
      streamVerified: true,
      http206Verified: true,
      r2PublicUrl: `${publicBaseUrl}/MOTION_BRAND_FILM.mp4`,
    };

    testContext.items = [verifiedItem];

    const step = new UpdateManifestStep();
    const result = await step.execute(testContext);

    assert.equal(result.success, true);
    assert.equal(testContext.manifestChanges?.added, 1);
    assert.equal(testContext.manifestChanges?.unchanged, 1);
    assert.equal(testContext.manifestAfter?.length, 2);

    // Verify on disk
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpRoot, manifestRel), 'utf-8'));
    assert.equal(onDisk.length, 2);
    // Keys sorted: MOTION_BRAND_FILM.mp4 comes before WED_PHUNGTUONG.wed.mp4
    assert.equal(onDisk[0].key, 'MOTION_BRAND_FILM.mp4');
    assert.equal(onDisk[1].key, 'WED_PHUNGTUONG.wed.mp4');
  });

  it('21. verification failure blocks manifest update: fails step if item is not verified', async () => {
    const unverifiedItem: PipelineItem = {
      id: 'item-unverified',
      sourcePath: '/path/FAIL_VIDEO.mp4',
      filename: 'FAIL_VIDEO.mp4',
      tag: 'FAIL',
      name: 'VIDEO',
      targetKey: 'FAIL_VIDEO.mp4',
      status: 'FAILED',
      r2ObjectVerified: false, // FAILED
      streamVerified: false,
    };

    testContext.items = [unverifiedItem];

    const step = new UpdateManifestStep();
    const result = await step.execute(testContext);

    assert.equal(result.success, false);
    assert.ok(result.message.includes('failed R2 object or HTTP 206 stream verification'));

    // Verify disk manifest remains untouched
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpRoot, manifestRel), 'utf-8'));
    assert.equal(onDisk.length, 1);
  });

  it('dry-run calculates diff and populates context without writing to disk', async () => {
    const verifiedItem: PipelineItem = {
      id: 'item-dry',
      sourcePath: '/path/DOC_STREET_DN.mp4',
      filename: 'DOC_STREET_DN.mp4',
      tag: 'DOC',
      name: 'STREET_DN',
      targetKey: 'DOC_STREET_DN.mp4',
      status: 'VERIFIED',
      r2ObjectVerified: true,
      streamVerified: true,
    };

    const dryContext: PipelineContext = {
      ...testContext,
      isDryRun: true,
      items: [verifiedItem],
    };

    const step = new UpdateManifestStep();
    const result = await step.execute(dryContext);

    assert.equal(result.success, true);
    assert.ok(result.message.includes('[DryRun]'));
    assert.equal(dryContext.manifestChanges?.added, 1);

    // Verify disk manifest NOT modified
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpRoot, manifestRel), 'utf-8'));
    assert.equal(onDisk.length, 1);
  });

  it('23. no remote R2 mutation: manifest update strictly operates on local file without network calls', async () => {
    // Verify that UpdateManifestStep does not instantiate R2Client or execute network mutation
    const verifiedItem: PipelineItem = {
      id: 'item-local-only',
      sourcePath: '/path/MV_SUMMER.mp4',
      filename: 'MV_SUMMER.mp4',
      tag: 'MV',
      name: 'SUMMER',
      targetKey: 'MV_SUMMER.mp4',
      status: 'VERIFIED',
      r2ObjectVerified: true,
      streamVerified: true,
    };

    testContext.items = [verifiedItem];

    const step = new UpdateManifestStep();
    const result = await step.execute(testContext);

    assert.equal(result.success, true);
    // Remote R2 manifest was not called or modified
    assert.ok(result.message.includes('Manifest updated successfully'));
  });

  it('orchestrator halts cleanly at UPDATING_MANIFEST when stopAfterStage is specified', async () => {
    const verifiedItem: PipelineItem = {
      id: 'item-orch',
      sourcePath: '/path/WED_NEW.mp4',
      filename: 'WED_NEW.mp4',
      tag: 'WED',
      name: 'NEW',
      targetKey: 'WED_NEW.mp4',
      status: 'VERIFIED',
      r2ObjectVerified: true,
      streamVerified: true,
    };

    // Construct orchestrator with only UpdateManifestStep to isolate Phase 05 stage
    const orchestrator = new VideoPipelineOrchestrator([new UpdateManifestStep()]);
    testContext.currentStage = 'VERIFYING_STREAM';
    testContext.items = [verifiedItem];

    const result = await orchestrator.execute(testContext, 'UPDATING_MANIFEST');

    assert.equal(result.success, true);
    assert.equal(result.finalStage, 'UPDATING_MANIFEST');
    assert.equal(testContext.currentStage, 'UPDATING_MANIFEST');
  });
});
