import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Http206StreamVerifier } from '../../engines/r2/stream-verifier.js';

describe('HTTP 206 Stream Verifier Unit Tests', () => {
  it('9. HTTP 206 success: verifies valid partial content chunk and headers', async () => {
    const chunkLength = 1048576; // 1MB
    const fakeChunk = new Uint8Array(chunkLength);

    const mockFetch: typeof fetch = async (url, init) => {
      assert.equal(init?.headers?.['Range' as keyof typeof init.headers], 'bytes=0-1048575');
      return new Response(fakeChunk, {
        status: 206,
        headers: {
          'content-type': 'video/mp4',
          'accept-ranges': 'bytes',
          'content-range': 'bytes 0-1048575/67664128',
          'content-length': String(chunkLength),
        },
      });
    };

    const verifier = new Http206StreamVerifier(mockFetch);
    const report = await verifier.verifyVideoStream('https://pub-mock.r2.dev/VIDEO.mp4');

    assert.equal(report.passed, true);
    assert.equal(report.statusCode, 206);
    assert.equal(report.isPartialContent, true);
    assert.equal(report.rangeVerified, true);
    assert.equal(report.contentType, 'video/mp4');
    assert.equal(report.contentRange, 'bytes 0-1048575/67664128');
  });

  it('10. HTTP 200 rejection: fails when server returns 200 instead of 206 Partial Content', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(new Uint8Array(5000), {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
        },
      });
    };

    const verifier = new Http206StreamVerifier(mockFetch);
    const report = await verifier.verifyVideoStream('https://pub-mock.r2.dev/FULL.mp4');

    assert.equal(report.passed, false);
    assert.equal(report.statusCode, 200);
    assert.equal(report.isPartialContent, false);
    assert.match(report.error || '', /HTTP 200 OK instead of required HTTP 206/);
  });

  it('11. HTTP 404 rejection: fails when URL does not exist', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response('Not Found', { status: 404 });
    };

    const verifier = new Http206StreamVerifier(mockFetch);
    const report = await verifier.verifyVideoStream('https://pub-mock.r2.dev/NOT_FOUND.mp4');

    assert.equal(report.passed, false);
    assert.equal(report.statusCode, 404);
    assert.match(report.error || '', /status 404/);
  });

  it('12. Invalid Content-Range: fails when Content-Range header is malformed or invalid', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(new Uint8Array(100), {
        status: 206,
        headers: {
          'content-type': 'video/mp4',
          'content-range': 'invalid-content-range-format',
        },
      });
    };

    const verifier = new Http206StreamVerifier(mockFetch);
    const report = await verifier.verifyVideoStream('https://pub-mock.r2.dev/BAD_HEADER.mp4');

    assert.equal(report.passed, false);
    assert.match(report.error || '', /Malformed Content-Range/);
  });

  it('13. Empty range body: fails when HTTP 206 response body is 0 bytes', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(new Uint8Array(0), {
        status: 206,
        headers: {
          'content-type': 'video/mp4',
          'content-range': 'bytes 0-1048575/10000000',
        },
      });
    };

    const verifier = new Http206StreamVerifier(mockFetch);
    const report = await verifier.verifyVideoStream('https://pub-mock.r2.dev/EMPTY.mp4');

    assert.equal(report.passed, false);
    assert.match(report.error || '', /response body is empty/);
  });
});
