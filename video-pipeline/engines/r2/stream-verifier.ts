/**
 * HTTP 206 Partial Content Stream Verifier
 * Validates that Cloudflare CDN and public delivery URLs properly respond to
 * byte range requests for smooth video scrubbing and streaming playback.
 */

export interface StreamVerificationReport {
  url: string;
  statusCode: number;
  isPartialContent: boolean; // Must be strictly HTTP 206
  contentType?: string; // Must be video/mp4
  acceptRanges?: string; // Expected 'bytes'
  contentRange?: string; // e.g. 'bytes 0-1048575/67664128'
  contentLength?: number;
  rangeVerified: boolean;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export interface StreamVerifier {
  testRangeRequest(url: string, range?: string): Promise<StreamVerificationReport>;
  verifyRange(url: string, range?: string): Promise<StreamVerificationReport>;
  verifyVideoStream(url: string): Promise<StreamVerificationReport>;
  verifyMany(urls: string[]): Promise<StreamVerificationReport[]>;
}

export class Http206StreamVerifier implements StreamVerifier {
  private readonly fetchFn: typeof fetch;

  constructor(customFetch?: typeof fetch) {
    this.fetchFn = customFetch || globalThis.fetch;
  }

  /**
   * Performs an HTTP Range request against the public URL and validates HTTP 206 compliance.
   * Default range requests the first 1 MB chunk (bytes=0-1048575).
   */
  public async testRangeRequest(
    url: string,
    range = 'bytes=0-1048575'
  ): Promise<StreamVerificationReport> {
    const startTime = Date.now();

    try {
      const res = await this.fetchFn(url, {
        method: 'GET',
        headers: {
          Range: range,
        },
      });

      const durationMs = Date.now() - startTime;
      const statusCode = res.status;
      const isPartialContent = statusCode === 206;

      const headerMap: Record<string, string> = {};
      res.headers.forEach((val, name) => {
        headerMap[name.toLowerCase()] = val;
      });

      const contentType = headerMap['content-type'];
      const acceptRanges = headerMap['accept-ranges'];
      const contentRange = headerMap['content-range'];
      const lengthHeader = headerMap['content-length'];
      const contentLength = lengthHeader ? parseInt(lengthHeader, 10) : undefined;

      // 1. HTTP 200 Rejection: Server delivered entire file, ignoring Range header
      if (statusCode === 200) {
        return {
          url,
          statusCode,
          isPartialContent: false,
          contentType,
          acceptRanges,
          contentRange,
          contentLength,
          rangeVerified: false,
          passed: false,
          durationMs,
          error: `Server responded with HTTP 200 OK instead of required HTTP 206 Partial Content. Byte range requests are disabled or unhonored.`,
        };
      }

      // 2. HTTP Error Status Rejection (404, 403, 500, etc.)
      if (!isPartialContent) {
        return {
          url,
          statusCode,
          isPartialContent: false,
          contentType,
          acceptRanges,
          contentRange,
          contentLength,
          rangeVerified: false,
          passed: false,
          durationMs,
          error: `HTTP Range request failed with status ${statusCode}. Expected HTTP 206 Partial Content.`,
        };
      }

      // 3. Content-Type Validation: Must be video/mp4
      const ctLower = (contentType || '').toLowerCase();
      if (!ctLower.includes('video/mp4')) {
        return {
          url,
          statusCode,
          isPartialContent: true,
          contentType,
          acceptRanges,
          contentRange,
          contentLength,
          rangeVerified: false,
          passed: false,
          durationMs,
          error: `Invalid Content-Type '${contentType || 'none'}'. Expected 'video/mp4'.`,
        };
      }

      // 4. Content-Range Header Validation
      if (!contentRange) {
        return {
          url,
          statusCode,
          isPartialContent: true,
          contentType,
          acceptRanges,
          contentRange: undefined,
          contentLength,
          rangeVerified: false,
          passed: false,
          durationMs,
          error: `Missing required 'Content-Range' response header on HTTP 206 response.`,
        };
      }

      // Parse Content-Range: bytes <start>-<end>/<total>
      const match = contentRange.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
      if (!match) {
        return {
          url,
          statusCode,
          isPartialContent: true,
          contentType,
          acceptRanges,
          contentRange,
          contentLength,
          rangeVerified: false,
          passed: false,
          durationMs,
          error: `Malformed Content-Range header format: '${contentRange}'. Expected 'bytes start-end/total'.`,
        };
      }

      const start = parseInt(match[1], 10);
      const end = parseInt(match[2], 10);
      const totalStr = match[3];

      if (start !== 0 || end < start) {
        return {
          url,
          statusCode,
          isPartialContent: true,
          contentType,
          acceptRanges,
          contentRange,
          contentLength,
          rangeVerified: false,
          passed: false,
          durationMs,
          error: `Invalid Content-Range span: start=${start}, end=${end}. Initial chunk must begin at byte 0.`,
        };
      }

      if (totalStr !== '*') {
        const total = parseInt(totalStr, 10);
        if (total <= end) {
          return {
            url,
            statusCode,
            isPartialContent: true,
            contentType,
            acceptRanges,
            contentRange,
            contentLength,
            rangeVerified: false,
            passed: false,
            durationMs,
            error: `Invalid Content-Range total=${total} is not greater than end=${end}.`,
          };
        }
      }

      // 5. Body Length Validation
      const arrayBuffer = await res.arrayBuffer();
      const bodyLength = arrayBuffer.byteLength;

      if (bodyLength === 0) {
        return {
          url,
          statusCode,
          isPartialContent: true,
          contentType,
          acceptRanges,
          contentRange,
          contentLength: 0,
          rangeVerified: false,
          passed: false,
          durationMs,
          error: `HTTP 206 response body is empty (0 bytes).`,
        };
      }

      const expectedChunkLength = end - start + 1;
      if (bodyLength !== expectedChunkLength) {
        return {
          url,
          statusCode,
          isPartialContent: true,
          contentType,
          acceptRanges,
          contentRange,
          contentLength: bodyLength,
          rangeVerified: false,
          passed: false,
          durationMs,
          error: `Received body length (${bodyLength} bytes) does not match Content-Range range span (${expectedChunkLength} bytes).`,
        };
      }

      return {
        url,
        statusCode: 206,
        isPartialContent: true,
        contentType,
        acceptRanges,
        contentRange,
        contentLength: bodyLength,
        rangeVerified: true,
        passed: true,
        durationMs,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        url,
        statusCode: 0,
        isPartialContent: false,
        rangeVerified: false,
        passed: false,
        durationMs: Date.now() - startTime,
        error: `Network failure during HTTP 206 stream test: ${message}`,
      };
    }
  }

  public async verifyRange(url: string, range?: string): Promise<StreamVerificationReport> {
    return this.testRangeRequest(url, range);
  }

  public async verifyVideoStream(url: string): Promise<StreamVerificationReport> {
    return this.testRangeRequest(url, 'bytes=0-1048575');
  }

  public async verifyMany(urls: string[]): Promise<StreamVerificationReport[]> {
    const reports: StreamVerificationReport[] = [];
    for (const url of urls) {
      const report = await this.testRangeRequest(url);
      reports.push(report);
    }
    return reports;
  }
}
