/**
 * Manifest Writer Unit Tests
 * Verifies atomic writing, transactional backup, verification, and rollback mechanics.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ManifestWriter } from '../../engines/manifest/manifest-writer.js';
import { ManifestError } from '../../core/errors/pipeline-errors.js';

describe('ManifestWriter Unit Tests', () => {
  const tmpRoot = path.join(os.tmpdir(), `manifest-writer-test-${Date.now()}`);
  const manifestRel = 'data/work-manifest.json';
  const tempDir = path.join(tmpRoot, 'video-pipeline/temp');
  const publicBaseUrl = 'https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev';

  beforeEach(() => {
    fs.mkdirSync(path.join(tmpRoot, 'data'), { recursive: true });
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('18. atomic write: writes, verifies, and produces valid manifest on disk', () => {
    const writer = new ManifestWriter(tmpRoot, manifestRel, { tempDir, publicBaseUrl });
    const entries = [
      {
        key: 'WED_PHUNGTUONG.wed.mp4',
        url: `${publicBaseUrl}/WED_PHUNGTUONG.wed.mp4`,
        tag: 'WED',
        name: 'PHUNGTUONG',
      },
    ];

    writer.atomicWrite(entries);

    const fullPath = writer.getManifestPath();
    assert.ok(fs.existsSync(fullPath));

    const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    assert.equal(content.length, 1);
    assert.equal(content[0].key, 'WED_PHUNGTUONG.wed.mp4');

    // Verify temp file cleaned up
    assert.ok(!fs.existsSync(writer.getTempWritePath()));
  });

  it('19. failed write preserves original: restores from .bak if write/validation fails', () => {
    const writer = new ManifestWriter(tmpRoot, manifestRel, { tempDir, publicBaseUrl });
    const originalEntries = [
      {
        key: 'ORIGINAL_VIDEO.mp4',
        url: `${publicBaseUrl}/ORIGINAL_VIDEO.mp4`,
        tag: 'ORIGINAL',
        name: 'VIDEO',
      },
    ];

    // Seed original manifest
    writer.atomicWrite(originalEntries);
    assert.equal(JSON.parse(fs.readFileSync(writer.getManifestPath(), 'utf-8'))[0].key, 'ORIGINAL_VIDEO.mp4');

    // Attempt to write invalid manifest (missing url)
    const invalidEntries: any = [
      {
        key: 'BAD_VIDEO.mp4',
        tag: 'BAD',
        name: 'VIDEO',
      },
    ];

    assert.throws(
      () => writer.atomicWrite(invalidEntries),
      (err: any) => err instanceof ManifestError
    );

    // Verify original manifest is preserved intact
    const afterFailedAttempt = JSON.parse(fs.readFileSync(writer.getManifestPath(), 'utf-8'));
    assert.equal(afterFailedAttempt.length, 1);
    assert.equal(afterFailedAttempt[0].key, 'ORIGINAL_VIDEO.mp4');
  });

  it('preview computes diff without modifying disk', () => {
    const writer = new ManifestWriter(tmpRoot, manifestRel, { tempDir, publicBaseUrl });
    const originalEntries = [
      {
        key: 'ITEM_1.mp4',
        url: `${publicBaseUrl}/ITEM_1.mp4`,
        tag: 'ITEM',
        name: 'ONE',
      },
    ];
    writer.atomicWrite(originalEntries);

    const newEntries = [
      ...originalEntries,
      {
        key: 'ITEM_2.mp4',
        url: `${publicBaseUrl}/ITEM_2.mp4`,
        tag: 'ITEM',
        name: 'TWO',
      },
    ];

    const preview = writer.preview(newEntries);
    assert.equal(preview.currentEntries.length, 1);
    assert.equal(preview.newEntries.length, 2);
    assert.equal(preview.diff.addedCount, 1);

    // Verify disk was NOT changed
    const onDisk = JSON.parse(fs.readFileSync(writer.getManifestPath(), 'utf-8'));
    assert.equal(onDisk.length, 1);
  });
});
