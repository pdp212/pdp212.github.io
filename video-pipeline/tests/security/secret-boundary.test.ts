/**
 * Security Test: Secret Boundary and Redaction Checks
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SecretSanitizer } from '../../core/security/secret-sanitizer.js';

describe('Security & Secret Boundary', () => {
  test('redacts simulated GitHub PAT from log text', () => {
    const raw = 'Attempted connection with token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890 to GitHub';
    const clean = SecretSanitizer.sanitizeString(raw);

    assert.strictEqual(clean.includes('ghp_'), false);
    assert.ok(clean.includes('[REDACTED_GITHUB_PAT]'));
  });

  test('redacts configured environment secrets if injected', () => {
    process.env.R2_SECRET_ACCESS_KEY = 'SuperSecretCloudflareR2KeyXYZ123';
    const logMessage = 'Failed to connect using secret SuperSecretCloudflareR2KeyXYZ123 on endpoint';
    const sanitized = SecretSanitizer.sanitizeString(logMessage);

    assert.strictEqual(sanitized.includes('SuperSecretCloudflareR2KeyXYZ123'), false);
    assert.ok(sanitized.includes('[REDACTED_R2_SECRET_ACCESS_KEY]'));

    delete process.env.R2_SECRET_ACCESS_KEY;
  });

  test('sanitizes nested JSON objects without mutating original structure', () => {
    const sensitiveObj = {
      user: 'admin',
      token: 'ghp_012345678901234567890123456789012345',
      meta: {
        note: 'private data',
      },
    };

    const sanitized = SecretSanitizer.sanitizeObject(sensitiveObj);
    assert.strictEqual(sanitized.token, '[REDACTED_GITHUB_PAT]');
    assert.strictEqual(sanitized.user, 'admin');
    assert.strictEqual(sanitized.meta.note, 'private data');
  });
});
