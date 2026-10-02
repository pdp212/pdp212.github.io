import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { R2Client, type R2ClientConfig } from '../../engines/r2/r2-client.js';
import { CloudflareR2Verifier } from '../../engines/r2/verifier.js';

describe('Cloudflare R2 Object Verifier Unit Tests', () => {
  const dummyConfig: R2ClientConfig = {
    accountId: 'mock_account',
    accessKeyId: 'mock_key',
    secretAccessKey: 'mock_secret',
    bucket: 'test-bucket',
    publicBaseUrl: 'https://pub-mock.r2.dev',
  };

  it('5. HEAD 200: verifies compliant object with matching size and content-type', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(null, {
        status: 200,
        headers: {
          'content-length': '2048000',
          'content-type': 'video/mp4',
          etag: '"etag_valid_123"',
        },
      });
    };

    const client = new R2Client(dummyConfig, mockFetch);
    const verifier = new CloudflareR2Verifier(client);

    const result = await verifier.verifyObject('TEST.mp4', 2048000, 'video/mp4');

    assert.equal(result.exists, true);
    assert.equal(result.passed, true);
    assert.equal(result.matchesLocalSize, true);
    assert.equal(result.contentLength, 2048000);
    assert.equal(result.contentType, 'video/mp4');
    assert.equal(result.etag, 'etag_valid_123');
  });

  it('6. HEAD 404: reports missing object when R2 returns 404', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(null, { status: 404 });
    };

    const client = new R2Client(dummyConfig, mockFetch);
    const verifier = new CloudflareR2Verifier(client);

    const result = await verifier.verifyObject('MISSING.mp4');

    assert.equal(result.exists, false);
    assert.equal(result.passed, false);
    assert.match(result.error || '', /does not exist/);
  });

  it('7. Content-Type mismatch: rejects object if content-type is not video/mp4', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(null, {
        status: 200,
        headers: {
          'content-length': '2048000',
          'content-type': 'application/octet-stream',
          etag: '"etag_bin"',
        },
      });
    };

    const client = new R2Client(dummyConfig, mockFetch);
    const verifier = new CloudflareR2Verifier(client);

    const result = await verifier.verifyObject('WRONG_MIME.mp4', 2048000, 'video/mp4');

    assert.equal(result.exists, true);
    assert.equal(result.passed, false);
    assert.match(result.error || '', /Content-Type mismatch/);
  });

  it('8. Content-Length mismatch: rejects object if remote size differs from local size', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(null, {
        status: 200,
        headers: {
          'content-length': '1000000',
          'content-type': 'video/mp4',
        },
      });
    };

    const client = new R2Client(dummyConfig, mockFetch);
    const verifier = new CloudflareR2Verifier(client);

    const result = await verifier.verifyObject('TRUNCATED.mp4', 2000000, 'video/mp4');

    assert.equal(result.exists, true);
    assert.equal(result.passed, false);
    assert.equal(result.matchesLocalSize, false);
    assert.match(result.error || '', /Content-Length mismatch/);
  });
});
