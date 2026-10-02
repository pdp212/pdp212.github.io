/**
 * Cloudflare R2 Client Factory & Connection Config
 * Secrets are strictly injected from process.env at runtime.
 * Implements native AWS Signature Version 4 (SigV4) for S3 REST API calls.
 */

import crypto from 'node:crypto';
import type { PipelineCredentials } from '../../core/security/secret-sanitizer.js';
import {
  R2UploadError,
  R2VerificationError,
  R2CredentialsError,
} from '../../core/errors/pipeline-errors.js';

export interface R2ClientConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  region?: string;
}

export interface HeadObjectResult {
  exists: boolean;
  statusCode: number;
  contentLength?: number;
  contentType?: string;
  etag?: string;
  headers: Record<string, string>;
}

export interface PutObjectResult {
  key: string;
  bucket: string;
  etag?: string;
  sizeBytes: number;
  statusCode: number;
}

export class R2ClientFactory {
  public static createConfig(
    credentials: PipelineCredentials,
    bucket?: string,
    publicBaseUrl?: string
  ): R2ClientConfig {
    const finalBucket = credentials.r2BucketName || bucket;
    const finalBaseUrl = credentials.r2PublicBaseUrl || publicBaseUrl;

    if (!finalBucket) {
      throw new Error('R2 Bucket name is required but not provided in config or environment.');
    }
    if (!finalBaseUrl) {
      throw new Error('R2 Public Base URL is required but not provided in config or environment.');
    }

    return {
      accountId: credentials.r2AccountId,
      accessKeyId: credentials.r2AccessKeyId,
      secretAccessKey: credentials.r2SecretAccessKey,
      bucket: finalBucket,
      publicBaseUrl: finalBaseUrl,
      region: 'auto',
    };
  }

  public static getEndpointUrl(accountId: string): string {
    return `https://${accountId}.r2.cloudflarestorage.com`;
  }
}

export class R2Client {
  private readonly config: R2ClientConfig;
  private readonly fetchFn: typeof fetch;
  private readonly region: string;

  constructor(config: R2ClientConfig, customFetch?: typeof fetch) {
    if (!config.accountId || !config.accessKeyId || !config.secretAccessKey) {
      throw new R2CredentialsError('Missing required R2 credentials in client configuration.');
    }
    this.config = config;
    this.fetchFn = customFetch || globalThis.fetch;
    this.region = config.region || 'auto';
  }

  public getConfig(): Readonly<R2ClientConfig> {
    return this.config;
  }

  public getEndpointUrl(): string {
    return R2ClientFactory.getEndpointUrl(this.config.accountId);
  }

  public getPublicUrl(key: string): string {
    const cleanBase = this.config.publicBaseUrl.replace(/\/+$/, '');
    const cleanKey = key.replace(/^\/+/, '');
    return `${cleanBase}/${cleanKey}`;
  }

  /**
   * Signs and executes a HEAD request to verify object metadata.
   */
  public async headObject(key: string): Promise<HeadObjectResult> {
    const cleanKey = key.replace(/^\/+/, '');
    const host = `${this.config.accountId}.r2.cloudflarestorage.com`;
    const path = `/${this.config.bucket}/${encodeURIComponent(cleanKey).replace(/%2F/g, '/')}`;
    const url = `https://${host}${path}`;

    const headers = this.signRequest('HEAD', path, host);

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'HEAD',
        headers,
      });
    } catch (err) {
      throw new R2VerificationError(`Network error while probing R2 object '${cleanKey}': ${(err as Error).message}`);
    }

    const headerMap: Record<string, string> = {};
    res.headers.forEach((val, name) => {
      headerMap[name.toLowerCase()] = val;
    });

    if (res.status === 200) {
      const lengthHeader = headerMap['content-length'];
      const contentLength = lengthHeader ? parseInt(lengthHeader, 10) : undefined;
      const contentType = headerMap['content-type'];
      const etag = headerMap['etag'] ? headerMap['etag'].replace(/^"|"$/g, '') : undefined;

      return {
        exists: true,
        statusCode: 200,
        contentLength,
        contentType,
        etag,
        headers: headerMap,
      };
    }

    if (res.status === 404) {
      return {
        exists: false,
        statusCode: 404,
        headers: headerMap,
      };
    }

    if (res.status === 401 || res.status === 403) {
      throw new R2CredentialsError(
        `Cloudflare R2 authentication failed (HTTP ${res.status}): Unauthorized access or invalid credentials.`,
        { statusCode: res.status, key: cleanKey }
      );
    }

    throw new R2VerificationError(
      `Cloudflare R2 HEAD request failed for key '${cleanKey}' with HTTP status ${res.status}.`,
      { statusCode: res.status, key: cleanKey }
    );
  }

  /**
   * Signs and executes a PUT request to upload an object to Cloudflare R2.
   */
  public async putObject(
    key: string,
    body: Buffer | Uint8Array,
    contentType = 'video/mp4'
  ): Promise<PutObjectResult> {
    const cleanKey = key.replace(/^\/+/, '');
    const host = `${this.config.accountId}.r2.cloudflarestorage.com`;
    const path = `/${this.config.bucket}/${encodeURIComponent(cleanKey).replace(/%2F/g, '/')}`;
    const url = `https://${host}${path}`;

    const extraHeaders: Record<string, string> = {
      'content-type': contentType,
      'content-length': String(body.length),
    };

    const headers = this.signRequest('PUT', path, host, body, extraHeaders);

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'PUT',
        headers,
        body: body as unknown as BodyInit,
      });
    } catch (err) {
      throw new R2UploadError(`Network error while uploading '${cleanKey}' to R2: ${(err as Error).message}`);
    }

    if (res.status === 200 || res.status === 201) {
      const etag = res.headers.get('etag')?.replace(/^"|"$/g, '');
      return {
        key: cleanKey,
        bucket: this.config.bucket,
        etag,
        sizeBytes: body.length,
        statusCode: res.status,
      };
    }

    if (res.status === 401 || res.status === 403) {
      throw new R2CredentialsError(
        `Cloudflare R2 upload authorization rejected (HTTP ${res.status}): Invalid credentials or insufficient permissions.`,
        { statusCode: res.status, key: cleanKey }
      );
    }

    let errorDetail = '';
    try {
      errorDetail = await res.text();
    } catch {}

    throw new R2UploadError(
      `Cloudflare R2 PUT upload failed for key '${cleanKey}' with HTTP status ${res.status}${errorDetail ? `: ${errorDetail}` : ''}`,
      { statusCode: res.status, key: cleanKey, errorDetail }
    );
  }

  /**
   * Generates AWS Signature Version 4 headers for the specified HTTP request.
   */
  public signRequest(
    method: 'GET' | 'HEAD' | 'PUT',
    canonicalUri: string,
    host: string,
    payload?: Buffer | Uint8Array,
    extraHeaders: Record<string, string> = {}
  ): Record<string, string> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    const payloadSha256 = payload
      ? crypto.createHash('sha256').update(payload).digest('hex')
      : crypto.createHash('sha256').update('').digest('hex');

    const headersToSign: Record<string, string> = {
      host: host.toLowerCase(),
      'x-amz-content-sha256': payloadSha256,
      'x-amz-date': amzDate,
    };

    for (const [k, v] of Object.entries(extraHeaders)) {
      headersToSign[k.toLowerCase()] = v;
    }

    const sortedHeaderKeys = Object.keys(headersToSign).sort();
    const canonicalHeaders = sortedHeaderKeys
      .map((k) => `${k}:${headersToSign[k].trim()}\n`)
      .join('');
    const signedHeaders = sortedHeaderKeys.join(';');

    const canonicalRequest = [
      method,
      canonicalUri,
      '', // query string
      canonicalHeaders,
      signedHeaders,
      payloadSha256,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const signingKey = this.getSignatureKey(this.config.secretAccessKey, dateStamp, this.region, 's3');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const finalHeaders: Record<string, string> = {
      ...headersToSign,
      authorization: authHeader,
    };

    return finalHeaders;
  }

  private getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
    const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    return kSigning;
  }
}
