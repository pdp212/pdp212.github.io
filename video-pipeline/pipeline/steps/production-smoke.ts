/**
 * Step 13: Production Live Smoke Test
 *
 * Phase 07 – verifies the live portfolio site after GitHub Pages deployment:
 *
 *   1. Portfolio homepage returns HTTP 200.
 *   2. work-manifest.json is reachable and non-empty.
 *   3. At least one video URL in the manifest points to Cloudflare R2.
 *   4. The R2 video responds to an HTTP Range request with HTTP 206 Partial Content.
 *   5. The Content-Type is video/mp4.
 *   6. No request goes to assets/videos/projects/* (fallback check is source-level,
 *      not network-level – network is R2 only by definition of the manifest).
 *
 * Timeout: context.config.timeout.smokeTestMs (default: 30 000 ms).
 */

import type { PipelineStep, StepResult } from './step-interface.js';
import type { PipelineContext } from '../context.js';
import { dryRunGuard } from './_utils.js';

interface ManifestEntry {
  key: string;
  url: string;
  tag?: string;
  name?: string;
}

/** Performs a single fetch with an abort timeout. */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class ProductionSmokeStep implements PipelineStep {
  public readonly stage = 'PRODUCTION_SMOKE_TEST' as const;
  public readonly name = 'Production Live Smoke Test';

  public async execute(context: PipelineContext): Promise<StepResult> {
    const productionUrl = context.config.productionUrl.replace(/\/$/, '');
    context.logger.info(
      this.stage,
      'START',
      `Running production smoke test against ${productionUrl}...`
    );

    // 1. Dry-run guard
    const early = dryRunGuard(this.stage, context, 'Production smoke test skipped.');
    if (early) return early;

    const timeoutMs = context.config.timeout.smokeTestMs || 30_000;

    try {
      // -----------------------------------------------------------------------
      // Check 1: Portfolio homepage reachable
      // -----------------------------------------------------------------------
      context.logger.info(this.stage, 'CHECK_HOME', `GET ${productionUrl}`);
      const homeRes = await fetchWithTimeout(productionUrl, {}, timeoutMs);
      if (!homeRes.ok) {
        throw new Error(
          `Portfolio homepage returned HTTP ${homeRes.status}. Expected 200.`
        );
      }
      context.logger.info(
        this.stage,
        'HOME_OK',
        `Homepage: HTTP ${homeRes.status}`
      );

      // -----------------------------------------------------------------------
      // Check 2: work-manifest.json reachable and valid
      // -----------------------------------------------------------------------
      const manifestUrl = `${productionUrl}/data/work-manifest.json`;
      context.logger.info(this.stage, 'CHECK_MANIFEST', `GET ${manifestUrl}`);
      const manifestRes = await fetchWithTimeout(manifestUrl, {}, timeoutMs);
      if (!manifestRes.ok) {
        throw new Error(
          `work-manifest.json returned HTTP ${manifestRes.status}. Expected 200.`
        );
      }

      let manifest: ManifestEntry[];
      try {
        manifest = (await manifestRes.json()) as ManifestEntry[];
      } catch {
        throw new Error('work-manifest.json is not valid JSON.');
      }

      if (!Array.isArray(manifest) || manifest.length === 0) {
        throw new Error('work-manifest.json is empty or not an array.');
      }
      context.logger.info(
        this.stage,
        'MANIFEST_OK',
        `Manifest loaded: ${manifest.length} entries.`
      );

      // -----------------------------------------------------------------------
      // Check 3: At least one R2 video URL exists in the manifest
      // -----------------------------------------------------------------------
      const r2Entry = manifest.find(
        (entry) =>
          typeof entry.url === 'string' &&
          entry.url.startsWith('https://') &&
          entry.url.includes('r2.dev')
      );

      if (!r2Entry) {
        throw new Error(
          'No Cloudflare R2 video URL found in work-manifest.json. ' +
            'All entries must reference R2 in production.'
        );
      }
      context.logger.info(
        this.stage,
        'R2_URL_FOUND',
        `Sample R2 URL: ${r2Entry.url}`
      );

      // -----------------------------------------------------------------------
      // Check 4 & 5: R2 video serves HTTP 206 with correct Content-Type
      // -----------------------------------------------------------------------
      context.logger.info(
        this.stage,
        'CHECK_STREAM',
        `Range request → ${r2Entry.url}`
      );
      const videoRes = await fetchWithTimeout(
        r2Entry.url,
        { headers: { Range: 'bytes=0-1023' } },
        timeoutMs
      );

      if (videoRes.status !== 206) {
        throw new Error(
          `R2 video did not serve HTTP 206 Partial Content. ` +
            `Got HTTP ${videoRes.status} for ${r2Entry.url}.`
        );
      }

      const contentType = videoRes.headers.get('content-type') ?? '';
      if (!contentType.includes('video/mp4')) {
        throw new Error(
          `R2 video Content-Type is '${contentType}', expected 'video/mp4'.`
        );
      }

      const contentRange = videoRes.headers.get('content-range') ?? '';
      context.logger.info(
        this.stage,
        'STREAM_OK',
        `HTTP 206 OK · Content-Type: ${contentType} · Content-Range: ${contentRange}`,
        'SUCCESS'
      );

      // -----------------------------------------------------------------------
      // Passed all checks
      // -----------------------------------------------------------------------
      context.logger.info(
        this.stage,
        'SMOKE_PASSED',
        'All production smoke test checks passed.',
        'SUCCESS'
      );

      return {
        success: true,
        stage: this.stage,
        message:
          `Production smoke test passed: homepage OK, manifest loaded ` +
          `(${manifest.length} entries), R2 video streams HTTP 206.`,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      context.logger.error(this.stage, 'SMOKE_FAILED', error.message);
      return { success: false, stage: this.stage, error, message: error.message };
    }
  }
}
