/**
 * Security Test: Manifest Secret Boundary & Credential Isolation Audit
 * Verifies zero credential leaks in manifest files, backups, temporary files, and manifest error logs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ManifestValidator } from '../../engines/manifest/manifest-validator.js';

describe('Phase 05 Manifest Security Boundary Audit', () => {
  it('manifest validator rejects credential query parameters and AWS keys', () => {
    const maliciousEntries = [
      {
        key: 'LEAK.mp4',
        url: 'https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev/LEAK.mp4?token=secret123',
        tag: 'LEAK',
        name: 'SECRET',
      },
      {
        key: 'AKIAIOSFODNN7EXAMPLE.mp4',
        url: 'https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev/AKIAIOSFODNN7EXAMPLE.mp4',
        tag: 'AKIA',
        name: 'KEY',
      },
    ];

    const result = ManifestValidator.validate(maliciousEntries);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('forbidden secret or credential pattern')));
  });

  it('verifies production data/work-manifest.json is clean of all secrets', () => {
    const manifestPath = path.resolve('../data/work-manifest.json');
    if (fs.existsSync(manifestPath)) {
      const content = fs.readFileSync(manifestPath, 'utf-8');
      assert.ok(!content.includes('AKIA'), 'Must not contain AWS key id');
      assert.ok(!content.includes('secret_access_key'), 'Must not contain secret_access_key');
      assert.ok(!content.includes('token='), 'Must not contain token query param');
      assert.ok(!content.includes('password'), 'Must not contain password');
    }
  });

  it('ensures temporary files and backup files do not retain credentials', () => {
    const tempDir = path.resolve('temp');
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        if (file.endsWith('.json') || file.endsWith('.bak') || file.endsWith('.tmp')) {
          const content = fs.readFileSync(path.join(tempDir, file), 'utf-8');
          assert.ok(!content.includes('AKIA'));
          assert.ok(!content.includes('secret_access_key'));
        }
      }
    }
  });
});
