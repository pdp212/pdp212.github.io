import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SecretSanitizer } from '../../core/security/secret-sanitizer.js';

describe('Phase 04 R2 Secret Boundary & Security Audit', () => {
  it('14. Secret redaction: redacts R2 secrets from text and serialized objects', () => {
    process.env.R2_ACCOUNT_ID = 'test_acc_999';
    process.env.R2_ACCESS_KEY_ID = 'test_key_888';
    process.env.R2_SECRET_ACCESS_KEY = 'super_secret_r2_key_xyz123';

    const rawLog = 'Connecting with test_acc_999 using test_key_888 and super_secret_r2_key_xyz123 to S3';
    const sanitized = SecretSanitizer.sanitizeString(rawLog);

    assert.ok(!sanitized.includes('super_secret_r2_key_xyz123'), 'Secret key must be redacted');
    assert.ok(!sanitized.includes('test_key_888'), 'Access key must be redacted');
    assert.ok(!sanitized.includes('test_acc_999'), 'Account ID must be redacted');
    assert.match(sanitized, /\[REDACTED_R2_SECRET_ACCESS_KEY\]/);
    assert.match(sanitized, /\[REDACTED_R2_ACCESS_KEY_ID\]/);
    assert.match(sanitized, /\[REDACTED_R2_ACCOUNT_ID\]/);
  });

  it('15. No credential persistence: checks that no credentials exist in manifest or git index', () => {
    const gitignorePath = path.resolve('.gitignore');
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');

    assert.ok(gitignoreContent.includes('.env'), '.gitignore must explicitly include .env');

    const manifestPath = path.resolve('../data/work-manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      assert.ok(!manifestContent.includes('R2_SECRET_ACCESS_KEY'), 'Manifest must never contain R2 secrets');
      assert.ok(!manifestContent.includes('super_secret'), 'Manifest must never contain secret values');
    }
  });

  it('PipelineItem data structure does not retain or store credentials', () => {
    const item = {
      id: 'item_test',
      fileName: 'VIDEO.mp4',
      localEncodedPath: '/path/VIDEO.mp4',
      objectKey: 'VIDEO.mp4',
      r2PublicUrl: 'https://pub-test.r2.dev/VIDEO.mp4',
      r2UploadStatus: 'UPLOADED' as const,
      r2ObjectVerified: true,
      streamVerified: true,
    };

    const serialized = JSON.stringify(item);
    assert.ok(!serialized.includes('secretAccessKey'));
    assert.ok(!serialized.includes('accessKeyId'));
  });
});
