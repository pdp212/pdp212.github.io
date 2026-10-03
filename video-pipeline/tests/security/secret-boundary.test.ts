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

  describe('scanDiffForSecrets – False Positive Immunity & Secret Detection', () => {
    test('TEST 1: SecretSanitizer implementation containing its own GitHub PAT regex must PASS', () => {
      const scannerSourceDiff = [
        'diff --git a/video-pipeline/core/security/secret-sanitizer.ts b/video-pipeline/core/security/secret-sanitizer.ts',
        '--- a/video-pipeline/core/security/secret-sanitizer.ts',
        '+++ b/video-pipeline/core/security/secret-sanitizer.ts',
        '@@ -130,4 +130,4 @@',
        `+    sanitized = sanitized.replace(/ghp_[a-zA-Z0-9]{20,}/g, '[REDACTED_GITHUB_PAT]');`,
        `+    sanitized = sanitized.replace(/github_pat_[a-zA-Z0-9_]{30,}/g, '[REDACTED_GITHUB_PAT]');`,
        `+    const pattern = /\\b(?:ghp_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{30,})\\b/;`,
      ].join('\n');

      const violations = SecretSanitizer.scanDiffForSecrets(scannerSourceDiff);
      assert.deepStrictEqual(violations, [], 'Self regex definitions in SecretSanitizer must not trigger self-detection');
    });

    test('TEST 2: SecretSanitizer implementation containing its own AWS key regex must PASS', () => {
      const scannerAwsDiff = [
        'diff --git a/video-pipeline/core/security/secret-sanitizer.ts b/video-pipeline/core/security/secret-sanitizer.ts',
        '--- a/video-pipeline/core/security/secret-sanitizer.ts',
        '+++ b/video-pipeline/core/security/secret-sanitizer.ts',
        '@@ -190,2 +190,2 @@',
        `+    const awsPattern = /\\b(?:AKIA|ASIA)[0-9A-Z]{16}\\b/;`,
      ].join('\n');

      const violations = SecretSanitizer.scanDiffForSecrets(scannerAwsDiff);
      assert.deepStrictEqual(violations, [], 'Self AWS key regex definitions in SecretSanitizer must not trigger self-detection');
    });

    test('TEST 3: Production source containing an actual GitHub PAT must FAIL', () => {
      const tokenVal = 'ghp_' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
      const leakingDiff = [
        'diff --git a/video-pipeline/pipeline/auth.ts b/video-pipeline/pipeline/auth.ts',
        '--- a/video-pipeline/pipeline/auth.ts',
        '+++ b/video-pipeline/pipeline/auth.ts',
        '@@ -1,2 +1,2 @@',
        `+const pat = "${tokenVal}";`,
      ].join('\n');

      const violations = SecretSanitizer.scanDiffForSecrets(leakingDiff);
      assert.ok(violations.length > 0, 'Must detect GitHub PAT in production code');
      assert.ok(violations.some((v) => v.includes('GitHub Personal Access Token')));
    });

    test('TEST 4: Production source containing an actual AWS Access Key ID must FAIL', () => {
      const awsVal = 'AKIA' + 'IOSFODNN7EXAMP12';
      const leakingDiff = [
        'diff --git a/video-pipeline/engines/r2/client.ts b/video-pipeline/engines/r2/client.ts',
        '--- a/video-pipeline/engines/r2/client.ts',
        '+++ b/video-pipeline/engines/r2/client.ts',
        '@@ -1,2 +1,2 @@',
        `+const awsKey = "${awsVal}";`,
      ].join('\n');

      const violations = SecretSanitizer.scanDiffForSecrets(leakingDiff);
      assert.ok(violations.length > 0, 'Must detect AWS Access Key ID in production code');
      assert.ok(violations.some((v) => v.includes('AWS Access Key ID')));
    });

    test('TEST 5: Production source containing an actual runtime R2 secret value must FAIL', () => {
      const runtimeSecret = 'real_runtime_secret_key_1234567890';
      process.env.R2_SECRET_ACCESS_KEY = runtimeSecret;
      const leakingDiff = [
        'diff --git a/video-pipeline/pipeline/steps/upload-r2.ts b/video-pipeline/pipeline/steps/upload-r2.ts',
        '--- a/video-pipeline/pipeline/steps/upload-r2.ts',
        '+++ b/video-pipeline/pipeline/steps/upload-r2.ts',
        '@@ -10,3 +10,3 @@',
        `+const leakedKey = "${runtimeSecret}";`,
      ].join('\n');

      try {
        const violations = SecretSanitizer.scanDiffForSecrets(leakingDiff);
        assert.ok(violations.length > 0, 'Must detect leaked runtime secret value');
        assert.ok(violations.some((v) => v.includes('Runtime secret value for R2_SECRET_ACCESS_KEY')));
      } finally {
        delete process.env.R2_SECRET_ACCESS_KEY;
      }
    });

    test('TEST 6: Existing .env / R2_SECRET_ACCESS_KEY variable names in comments, documentation, .gitignore assertions, and tests must PASS', () => {
      const benignDiff = [
        'diff --git a/video-pipeline/engines/git/git-safety.ts b/video-pipeline/engines/git/git-safety.ts',
        '--- a/video-pipeline/engines/git/git-safety.ts',
        '+++ b/video-pipeline/engines/git/git-safety.ts',
        '@@ -80,4 +80,4 @@',
        `+      errors.push("Missing required rule in .gitignore: '.env'");`,
        `+      const keyName = 'R2_SECRET_ACCESS_KEY';`,
        `+      // R2_SECRET_ACCESS_KEY must be loaded via process.env`,
        `+      // See https://pub-test.r2.dev/video.mp4 and repo pdp212/pdp212.github.io`,
      ].join('\n');

      const violations = SecretSanitizer.scanDiffForSecrets(benignDiff);
      assert.deepStrictEqual(violations, [], 'Benign variable names, comments, and .env documentation must pass');
    });

    test('TEST 7: Synthetic test fixtures must PASS when clearly marked synthetic', () => {
      const syntheticTestDiff = [
        'diff --git a/video-pipeline/tests/security/secret-boundary.test.ts b/video-pipeline/tests/security/secret-boundary.test.ts',
        '--- a/video-pipeline/tests/security/secret-boundary.test.ts',
        '+++ b/video-pipeline/tests/security/secret-boundary.test.ts',
        '@@ -10,3 +10,3 @@',
        `+const mockToken = "ghp_synthetic_test_token_1234567890";`,
        `+const mockAwsKey = "AKIA_MOCK_TEST_KEY_12";`,
      ].join('\n');

      const violations = SecretSanitizer.scanDiffForSecrets(syntheticTestDiff);
      assert.deepStrictEqual(violations, [], 'Synthetic marked test fixtures in test files must pass');
    });

    test('TEST 8: The complete current Phase 07 staged diff must pass the secret scanner', async () => {
      const { exec } = await import('node:child_process');
      const diff = await new Promise<string>((resolve, reject) => {
        exec('git diff --cached', { cwd: process.cwd() }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        });
      });

      const violations = SecretSanitizer.scanDiffForSecrets(diff);
      assert.deepStrictEqual(violations, [], 'Current Phase 07 staged diff must have zero secret violations');
    });
  });
});

