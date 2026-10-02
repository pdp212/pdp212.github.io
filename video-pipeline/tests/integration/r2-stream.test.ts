import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Http206StreamVerifier } from '../../engines/r2/stream-verifier.js';

describe('HTTP 206 Streaming CDN Integration Test', () => {
  let streamServer: http.Server;
  let serverPort: number;

  before(async () => {
    await new Promise<void>((resolve) => {
      streamServer = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://127.0.0.1`);

        if (url.pathname === '/valid-stream.mp4') {
          const range = req.headers.range;
          if (range && range.startsWith('bytes=0-1048575')) {
            const chunkSize = 1048576;
            const fakePayload = Buffer.alloc(chunkSize, 0xaa);
            res.writeHead(206, {
              'Content-Type': 'video/mp4',
              'Accept-Ranges': 'bytes',
              'Content-Range': `bytes 0-1048575/20000000`,
              'Content-Length': String(chunkSize),
            });
            res.end(fakePayload);
            return;
          }
        }

        if (url.pathname === '/full-stream.mp4') {
          // Misconfigured server ignoring Range header and returning 200
          res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Content-Length': '1000',
          });
          res.end(Buffer.alloc(1000));
          return;
        }

        res.writeHead(404);
        res.end();
      });

      streamServer.listen(0, '127.0.0.1', () => {
        const addr = streamServer.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      streamServer.close(() => resolve());
    });
  });

  it('proves HTTP 206 streaming passes against compliant endpoint', async () => {
    const verifier = new Http206StreamVerifier();
    const report = await verifier.verifyVideoStream(`http://127.0.0.1:${serverPort}/valid-stream.mp4`);

    assert.equal(report.passed, true);
    assert.equal(report.statusCode, 206);
    assert.equal(report.isPartialContent, true);
    assert.equal(report.rangeVerified, true);
    assert.equal(report.contentType, 'video/mp4');
  });

  it('rejects endpoint returning HTTP 200 instead of 206 Partial Content', async () => {
    const verifier = new Http206StreamVerifier();
    const report = await verifier.verifyVideoStream(`http://127.0.0.1:${serverPort}/full-stream.mp4`);

    assert.equal(report.passed, false);
    assert.equal(report.statusCode, 200);
    assert.match(report.error || '', /HTTP 200 OK instead of required HTTP 206/);
  });
});
