/**
 * Cloudflare R2 Object Verifier
 * Performs HEAD requests directly against Cloudflare R2 to verify object existence,
 * content-type (video/mp4), and exact content-length matching local encoded size.
 */

import { R2Client } from './r2-client.js';

export interface ObjectVerificationResult {
  key: string;
  exists: boolean;
  contentLength?: number;
  contentType?: string;
  etag?: string;
  matchesLocalSize: boolean;
  passed: boolean;
  error?: string;
}

export interface R2Verifier {
  verifyObject(
    key: string,
    expectedSize?: number,
    expectedContentType?: string
  ): Promise<ObjectVerificationResult>;
  verifyMany(
    items: Array<{ key: string; expectedSize?: number; expectedContentType?: string }>
  ): Promise<ObjectVerificationResult[]>;
}

export class CloudflareR2Verifier implements R2Verifier {
  private readonly client: R2Client;

  constructor(client: R2Client) {
    this.client = client;
  }

  /**
   * Directly verifies an object's existence and metadata on Cloudflare R2.
   */
  public async verifyObject(
    key: string,
    expectedSize?: number,
    expectedContentType = 'video/mp4'
  ): Promise<ObjectVerificationResult> {
    try {
      const head = await this.client.headObject(key);

      if (!head.exists) {
        return {
          key,
          exists: false,
          matchesLocalSize: false,
          passed: false,
          error: `Object '${key}' does not exist on R2 bucket '${this.client.getConfig().bucket}' (HTTP 404).`,
        };
      }

      const remoteType = (head.contentType || '').toLowerCase();
      const expectedType = expectedContentType.toLowerCase();
      const contentTypeMatches = remoteType === expectedType || remoteType.includes('video/mp4');

      if (!contentTypeMatches) {
        return {
          key,
          exists: true,
          contentLength: head.contentLength,
          contentType: head.contentType,
          etag: head.etag,
          matchesLocalSize: false,
          passed: false,
          error: `Content-Type mismatch for '${key}': Remote is '${head.contentType || 'none'}', expected '${expectedContentType}'.`,
        };
      }

      if (!head.contentLength || head.contentLength <= 0) {
        return {
          key,
          exists: true,
          contentLength: head.contentLength,
          contentType: head.contentType,
          etag: head.etag,
          matchesLocalSize: false,
          passed: false,
          error: `Object '${key}' exists but has invalid size: ${head.contentLength} bytes.`,
        };
      }

      const sizeMatches = expectedSize !== undefined ? head.contentLength === expectedSize : true;
      if (!sizeMatches) {
        return {
          key,
          exists: true,
          contentLength: head.contentLength,
          contentType: head.contentType,
          etag: head.etag,
          matchesLocalSize: false,
          passed: false,
          error: `Content-Length mismatch for '${key}': R2 has ${head.contentLength} bytes, local encoded file has ${expectedSize} bytes.`,
        };
      }

      return {
        key,
        exists: true,
        contentLength: head.contentLength,
        contentType: head.contentType,
        etag: head.etag,
        matchesLocalSize: true,
        passed: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        key,
        exists: false,
        matchesLocalSize: false,
        passed: false,
        error: `Verification failed for '${key}': ${message}`,
      };
    }
  }

  /**
   * Verifies multiple objects sequentially.
   */
  public async verifyMany(
    items: Array<{ key: string; expectedSize?: number; expectedContentType?: string }>
  ): Promise<ObjectVerificationResult[]> {
    const results: ObjectVerificationResult[] = [];
    for (const item of items) {
      const res = await this.verifyObject(item.key, item.expectedSize, item.expectedContentType);
      results.push(res);
    }
    return results;
  }
}
