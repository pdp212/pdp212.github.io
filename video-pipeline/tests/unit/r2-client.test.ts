import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { R2Client, R2ClientFactory, type R2ClientConfig } from '../../engines/r2/r2-client.js';
import { R2CredentialsError, R2UploadError, R2VerificationError } from '../../core/errors/pipeline-errors.js';

describe('Cloudflare R2 Client & SigV4 Signer', () => {
  const dummyConfig: R2ClientConfig = {
    accountId: 'mock_account_123',
    accessKeyId: 'mock_access_key_456',
    secretAccessKey: 'mock_secret_key_789',
    bucket: 'test-bucket',
    publicBaseUrl: 'https://pub-mock.r2.dev',
    region: 'auto',
  };

  it('R2ClientFactory creates valid config from credentials', () => {
    const config = R2ClientFactory.createConfig(
      {
        r2AccountId: 'acc_1',
        r2AccessKeyId: 'key_1',
        r2SecretAccessKey: 'sec_1',
      },
      'my-bucket',
      'https://pub-my.r2.dev'
    );

    assert.equal(config.accountId, 'acc_1');
    assert.equal(config.bucket, 'my-bucket');
    assert.equal(config.publicBaseUrl, 'https://pub-my.r2.dev');
    assert.equal(R2ClientFactory.getEndpointUrl('acc_1'), 'https://acc_1.r2.cloudflarestorage.com');
  });

  it('generates AWS SigV4 authorization headers with sha256 checksums', () => {
    const client = new R2Client(dummyConfig);
    const headers = client.signRequest('PUT', '/test-bucket/video.mp4', 'mock_account_123.r2.cloudflarestorage.com', Buffer.from('test data'));

    assert.ok(headers.authorization.startsWith('AWS4-HMAC-SHA256 Credential=mock_access_key_456/'));
    assert.ok(headers['x-amz-date']);
    assert.ok(headers['x-amz-content-sha256']);
    assert.equal(headers.host, 'mock_account_123.r2.cloudflarestorage.com');
  });

  it('generates normalized public URLs without double slashes', () => {
    const client = new R2Client(dummyConfig);
    const url = client.getPublicUrl('/WED_PHUNGTUONG.mp4');
    assert.equal(url, 'https://pub-mock.r2.dev/WED_PHUNGTUONG.mp4');

    const clientWithTrailingSlash = new R2Client({
      ...dummyConfig,
      publicBaseUrl: 'https://pub-mock.r2.dev/',
    });
    const url2 = clientWithTrailingSlash.getPublicUrl('test/sub/video.mp4');
    assert.equal(url2, 'https://pub-mock.r2.dev/test/sub/video.mp4');
  });

  it('putObject executes successfully with valid response', async () => {
    const mockFetch: typeof fetch = async (input, init) => {
      return new Response(null, {
        status: 200,
        headers: {
          etag: '"etag_mock_123"',
        },
      });
    };

    const client = new R2Client(dummyConfig, mockFetch);
    const res = await client.putObject('video.mp4', Buffer.from('fake mp4 video bytes'), 'video/mp4');

    assert.equal(res.key, 'video.mp4');
    assert.equal(res.bucket, 'test-bucket');
    assert.equal(res.etag, 'etag_mock_123');
    assert.equal(res.statusCode, 200);
  });

  it('putObject throws R2CredentialsError when authentication fails (HTTP 401/403)', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response('Unauthorized Access Denied', { status: 403 });
    };

    const client = new R2Client(dummyConfig, mockFetch);
    await assert.rejects(
      async () => client.putObject('video.mp4', Buffer.from('data')),
      (err: Error) => {
        assert.ok(err instanceof R2CredentialsError);
        assert.match(err.message, /403/);
        return true;
      }
    );
  });

  it('headObject returns exists: true and metadata when object exists (HTTP 200)', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(null, {
        status: 200,
        headers: {
          'content-length': '15728640',
          'content-type': 'video/mp4',
          etag: '"verified_etag"',
        },
      });
    };

    const client = new R2Client(dummyConfig, mockFetch);
    const head = await client.headObject('video.mp4');

    assert.equal(head.exists, true);
    assert.equal(head.statusCode, 200);
    assert.equal(head.contentLength, 15728640);
    assert.equal(head.contentType, 'video/mp4');
    assert.equal(head.etag, 'verified_etag');
  });

  it('headObject returns exists: false when object does not exist (HTTP 404)', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(null, { status: 404 });
    };

    const client = new R2Client(dummyConfig, mockFetch);
    const head = await client.headObject('missing.mp4');

    assert.equal(head.exists, false);
    assert.equal(head.statusCode, 404);
  });

  it('headObject throws R2CredentialsError on HTTP 401', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(null, { status: 401 });
    };

    const client = new R2Client(dummyConfig, mockFetch);
    await assert.rejects(
      async () => client.headObject('video.mp4'),
      R2CredentialsError
    );
  });
});
