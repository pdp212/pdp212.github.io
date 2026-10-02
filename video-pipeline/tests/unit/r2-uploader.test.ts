import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { R2Client, type R2ClientConfig } from '../../engines/r2/r2-client.js';
import { CloudflareR2Uploader } from '../../engines/r2/uploader.js';
import { R2CredentialsError, R2RetryExhaustedError, R2UploadError } from '../../core/errors/pipeline-errors.js';

describe('Cloudflare R2 Uploader Unit Tests', () => {
  const dummyConfig: R2ClientConfig = {
    accountId: 'mock_account',
    accessKeyId: 'mock_key',
    secretAccessKey: 'mock_secret',
    bucket: 'test-bucket',
    publicBaseUrl: 'https://pub-mock.r2.dev',
  };

  const tempTestFile = path.resolve('temp/uploader_test.mp4');

  it('setup test dummy mp4 file', () => {
    fs.mkdirSync(path.dirname(tempTestFile), { recursive: true });
    fs.writeFileSync(tempTestFile, Buffer.from('FAKE_ENCODED_MP4_CONTENT_12345'));
  });

  it('1. Upload success: uploads file and returns typed UploadResult', async () => {
    const mockFetch: typeof fetch = async (url, init) => {
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 404 });
      }
      return new Response(null, {
        status: 200,
        headers: { etag: '"mock_etag_1"' },
      });
    };

    const client = new R2Client(dummyConfig, mockFetch);
    const uploader = new CloudflareR2Uploader(client, { initialDelayMs: 10 });

    const result = await uploader.upload(tempTestFile, 'TEST_VIDEO.mp4');

    assert.equal(result.status, 'UPLOADED');
    assert.equal(result.objectKey, 'TEST_VIDEO.mp4');
    assert.equal(result.size, Buffer.from('FAKE_ENCODED_MP4_CONTENT_12345').length);
    assert.equal(result.publicUrl, 'https://pub-mock.r2.dev/TEST_VIDEO.mp4');
    assert.equal(result.etag, 'mock_etag_1');
  });

  it('18. Idempotent existing object: skips upload when R2 HEAD matches local size & contentType', async () => {
    const localSize = fs.statSync(tempTestFile).size;
    let putCalled = false;

    const mockFetch: typeof fetch = async (url, init) => {
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'content-length': String(localSize),
            'content-type': 'video/mp4',
            etag: '"existing_etag"',
          },
        });
      }
      if (init?.method === 'PUT') {
        putCalled = true;
        return new Response(null, { status: 200 });
      }
      return new Response(null, { status: 400 });
    };

    const client = new R2Client(dummyConfig, mockFetch);
    const uploader = new CloudflareR2Uploader(client);

    const result = await uploader.upload(tempTestFile, 'EXISTING_VIDEO.mp4');

    assert.equal(result.status, 'ALREADY_UPLOADED');
    assert.equal(putCalled, false, 'PUT should not be called when remote object matches');
    assert.equal(result.size, localSize);
    assert.equal(result.etag, 'existing_etag');
  });

  it('3. Retry transient failure: retries 500 error and succeeds on 2nd attempt', async () => {
    let attempts = 0;

    const mockFetch: typeof fetch = async (url, init) => {
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 404 });
      }
      attempts++;
      if (attempts === 1) {
        return new Response('500 Internal Server Error', { status: 500 });
      }
      return new Response(null, {
        status: 200,
        headers: { etag: '"retry_etag"' },
      });
    };

    const client = new R2Client(dummyConfig, mockFetch);
    const uploader = new CloudflareR2Uploader(client, { maxRetries: 2, initialDelayMs: 10, backoffFactor: 1 });

    const result = await uploader.upload(tempTestFile, 'RETRY_VIDEO.mp4');

    assert.equal(attempts, 2);
    assert.equal(result.status, 'UPLOADED');
    assert.equal(result.etag, 'retry_etag');
  });

  it('exhausts all retries and throws R2RetryExhaustedError when service remains unavailable', async () => {
    const mockFetch: typeof fetch = async (url, init) => {
      if (init?.method === 'HEAD') return new Response(null, { status: 404 });
      return new Response('503 Service Unavailable', { status: 503 });
    };

    const client = new R2Client(dummyConfig, mockFetch);
    const uploader = new CloudflareR2Uploader(client, { maxRetries: 2, initialDelayMs: 5, backoffFactor: 1 });

    await assert.rejects(
      async () => uploader.upload(tempTestFile, 'FAIL_RETRY.mp4'),
      R2RetryExhaustedError
    );
  });

  it('4. Invalid credentials: does not retry permanent 401/403 errors and fails immediately', async () => {
    let callCount = 0;
    const mockFetch: typeof fetch = async (url, init) => {
      callCount++;
      return new Response('Forbidden', { status: 403 });
    };

    const client = new R2Client(dummyConfig, mockFetch);
    const uploader = new CloudflareR2Uploader(client, { maxRetries: 3, initialDelayMs: 5 });

    await assert.rejects(
      async () => uploader.upload(tempTestFile, 'AUTH_FAIL.mp4'),
      R2CredentialsError
    );
    assert.equal(callCount, 1, 'Should fail immediately without retrying');
  });

  it('uploadMany executes sequentially across multiple files', async () => {
    const mockFetch: typeof fetch = async (url, init) => {
      if (init?.method === 'HEAD') return new Response(null, { status: 404 });
      return new Response(null, { status: 200, headers: { etag: '"many_etag"' } });
    };

    const client = new R2Client(dummyConfig, mockFetch);
    const uploader = new CloudflareR2Uploader(client, { initialDelayMs: 5 });

    const results = await uploader.uploadMany([
      { filePath: tempTestFile, key: 'VID1.mp4' },
      { filePath: tempTestFile, key: 'VID2.mp4' },
    ]);

    assert.equal(results.length, 2);
    assert.equal(results[0].objectKey, 'VID1.mp4');
    assert.equal(results[1].objectKey, 'VID2.mp4');
  });

  it('cleanup temp test file', () => {
    try {
      fs.unlinkSync(tempTestFile);
    } catch {}
  });
});
