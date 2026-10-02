/**
 * Manifest Reader Unit Tests
 * Verifies reading, parsing, error recovery, and structural expectations.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ManifestReader } from '../../engines/manifest/manifest-reader.js';
import { ManifestError } from '../../core/errors/pipeline-errors.js';

describe('ManifestReader Unit Tests', () => {
  const tmpDir = path.join(os.tmpdir(), `manifest-reader-test-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  it('1. valid manifest: reads and parses correctly', () => {
    const manifestPath = 'valid-manifest.json';
    const fullPath = path.join(tmpDir, manifestPath);
    const validData = [
      {
        key: 'WED_PHUNGTUONG.wed.mp4',
        url: 'https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev/WED_PHUNGTUONG.wed.mp4',
        tag: 'WED',
        name: 'PHUNGTUONG',
      },
    ];
    fs.writeFileSync(fullPath, JSON.stringify(validData, null, 2));

    const reader = new ManifestReader(tmpDir, manifestPath);
    const entries = reader.read();

    assert.equal(entries.length, 1);
    assert.equal(entries[0].key, 'WED_PHUNGTUONG.wed.mp4');
    assert.equal(entries[0].tag, 'WED');
  });

  it('2. empty manifest: returns empty array when allowCreateNew is true', () => {
    const manifestPath = 'empty-manifest.json';
    const fullPath = path.join(tmpDir, manifestPath);
    fs.writeFileSync(fullPath, '[]');

    const reader = new ManifestReader(tmpDir, manifestPath);
    const entries = reader.read();
    assert.equal(entries.length, 0);

    const nonExistentReader = new ManifestReader(tmpDir, 'non-existent.json', { allowCreateNew: true });
    assert.deepEqual(nonExistentReader.read(), []);
  });

  it('3. malformed JSON: throws descriptive ManifestError', () => {
    const manifestPath = 'malformed.json';
    const fullPath = path.join(tmpDir, manifestPath);
    fs.writeFileSync(fullPath, '{ invalid json');

    const reader = new ManifestReader(tmpDir, manifestPath);
    assert.throws(
      () => reader.read(),
      (err: any) => err instanceof ManifestError && err.message.includes('Malformed JSON')
    );
  });

  it('non-array root throws ManifestError', () => {
    const manifestPath = 'not-array.json';
    const fullPath = path.join(tmpDir, manifestPath);
    fs.writeFileSync(fullPath, JSON.stringify({ key: 'value' }));

    const reader = new ManifestReader(tmpDir, manifestPath);
    assert.throws(
      () => reader.read(),
      (err: any) => err instanceof ManifestError && err.message.includes('must contain a JSON array')
    );
  });

  it('non-existent file throws ManifestError when allowCreateNew is false', () => {
    const reader = new ManifestReader(tmpDir, 'missing.json', { allowCreateNew: false });
    assert.throws(
      () => reader.read(),
      (err: any) => err instanceof ManifestError && err.message.includes('not found')
    );
  });
});
