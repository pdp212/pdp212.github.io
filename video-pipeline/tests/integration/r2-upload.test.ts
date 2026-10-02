import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { R2Client, type R2ClientConfig } from '../../engines/r2/r2-client.js';
import { CloudflareR2Uploader } from '../../engines/r2/uploader.js';
import { CloudflareR2Verifier } from '../../engines/r2/verifier.js';

describe('R2 Upload & Verification Integration Test', () => {
  let mockServer: http.Server;
  let serverPort: number;
  const uploadedObjects = new Map<string, { body: Buffer; contentType: string; etag: string }>();

  const tempLocalFile = path.resolve('temp/integration_r2_upload.mp4');
  const dummyPayload = Buffer.from('INTEGRATION_TEST_MP4_BINARY_PAYLOAD_ABC123');

  before(async () => {
    fs.mkdirSync(path.dirname(tempLocalFile), { recursive: true });
    fs.writeFileSync(tempLocalFile, dummyPayload);

    // Spin up local mock S3 server
    await new Promise<void>((resolve) => {
      mockServer = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://127.0.0.1`);
        const key = url.pathname.replace(/^\/[^/]+\//, ''); // strip /bucket/

        if (req.method === 'HEAD') {
          const obj = uploadedObjects.get(key);
          if (obj) {
            res.writeHead(200, {
              'Content-Type': obj.contentType,
              'Content-Length': String(obj.body.length),
              etag: `"${obj.etag}"`,
            });
            res.end();
          } else {
            res.writeHead(404);
            res.end();
          }
          return;
        }

        if (req.method === 'PUT') {
          const chunks: Buffer[] = [];
          req.on('data', (c) => chunks.push(c));
          req.on('end', () => {
            const body = Buffer.concat(chunks);
            const contentType = req.headers['content-type'] || 'application/octet-stream';
            const etag = `etag_${Date.now()}`;
            uploadedObjects.set(key, { body, contentType, etag });

            res.writeHead(200, {
              etag: `"${etag}"`,
            });
            res.end();
          });
          return;
        }

        res.writeHead(405);
        res.end();
      });

      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });
  });

  after(async () => {
    try {
      fs.unlinkSync(tempLocalFile);
    } catch {}
    await new Promise<void>((resolve) => {
      mockServer.close(() => resolve());
    });
  });

  it('uploads file to mock S3 endpoint, verifies headers, and confirms with HEAD verification', async () => {
    // Custom fetch directing S3 requests to local mock server
    const customFetch: typeof fetch = async (url, init) => {
      const parsed = new URL(url as string);
      const localUrl = `http://127.0.0.1:${serverPort}${parsed.pathname}`;
      return fetch(localUrl, init);
    };

    const config: R2ClientConfig = {
      accountId: 'int_acc',
      accessKeyId: 'int_key',
      secretAccessKey: 'int_sec',
      bucket: 'my-bucket',
      publicBaseUrl: 'https://pub-mock.r2.dev',
    };

    const client = new R2Client(config, customFetch);
    const uploader = new CloudflareR2Uploader(client);
    const verifier = new CloudflareR2Verifier(client);

    // 1. Upload
    const uploadRes = await uploader.upload(tempLocalFile, 'INTEGRATION_TEST.mp4', 'video/mp4');
    assert.equal(uploadRes.status, 'UPLOADED');
    assert.equal(uploadRes.objectKey, 'INTEGRATION_TEST.mp4');
    assert.equal(uploadRes.size, dummyPayload.length);

    // 2. Direct HEAD Verification
    const verifyRes = await verifier.verifyObject('INTEGRATION_TEST.mp4', dummyPayload.length, 'video/mp4');
    assert.equal(verifyRes.passed, true);
    assert.equal(verifyRes.exists, true);
    assert.equal(verifyRes.matchesLocalSize, true);
    assert.equal(verifyRes.contentLength, dummyPayload.length);
    assert.equal(verifyRes.contentType, 'video/mp4');

    // 3. Idempotency on 2nd upload: should return ALREADY_UPLOADED
    const secondUploadRes = await uploader.upload(tempLocalFile, 'INTEGRATION_TEST.mp4', 'video/mp4');
    assert.equal(secondUploadRes.status, 'ALREADY_UPLOADED');
  });
});
