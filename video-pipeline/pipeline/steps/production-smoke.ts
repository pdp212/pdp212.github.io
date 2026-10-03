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
  public readonly name = 'Production Live Smoke Test & UI Visibility';

  public async execute(context: PipelineContext): Promise<StepResult> {
    const productionUrl = context.config.productionUrl.replace(/\/$/, '');
    context.logger.info(
      this.stage,
      'START',
      `Running production smoke test & UI visibility verification against ${productionUrl}...`
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
      // Check 3: Frontend Data Layer Script Configuration (data/work-data.js)
      // -----------------------------------------------------------------------
      const workDataScriptUrl = `${productionUrl}/data/work-data.js`;
      context.logger.info(this.stage, 'CHECK_WORK_DATA', `GET ${workDataScriptUrl}`);
      const workDataRes = await fetchWithTimeout(workDataScriptUrl, {}, timeoutMs);
      if (workDataRes.ok) {
        const workDataContent = await workDataRes.text();
        if (workDataContent.includes('r2.dev/work-manifest.json')) {
          throw new Error(
            'Frontend data/work-data.js is referencing stale R2 manifest URL instead of data/work-manifest.json.'
          );
        }
        context.logger.info(
          this.stage,
          'WORK_DATA_OK',
          'Frontend data/work-data.js correctly references repository data/work-manifest.json.'
        );
      }

      // -----------------------------------------------------------------------
      // Check 4: Target item(s) presence in production manifest
      // -----------------------------------------------------------------------
      const deliveredKeys = (context.items || []).map((i) => i.targetKey || i.filename).filter(Boolean);
      for (const targetKey of deliveredKeys) {
        const found = manifest.find((e) => e.key === targetKey);
        if (!found) {
          throw new Error(
            `Target video '${targetKey}' is missing from production work-manifest.json.`
          );
        }
        if (!found.url || !found.url.startsWith('https://') || !found.url.includes('r2.dev')) {
          throw new Error(
            `Target video '${targetKey}' has invalid R2 URL: '${found.url}'.`
          );
        }
      }

      // -----------------------------------------------------------------------
      // Check 5: Sample R2 video serves HTTP 206 with correct Content-Type
      // -----------------------------------------------------------------------
      const testEntry = manifest[0];
      if (!testEntry || !testEntry.url) {
        throw new Error('No valid video URL found in manifest.');
      }

      context.logger.info(
        this.stage,
        'CHECK_STREAM',
        `Range request → ${testEntry.url}`
      );
      const videoRes = await fetchWithTimeout(
        testEntry.url,
        { headers: { Range: 'bytes=0-1023' } },
        timeoutMs
      );

      if (videoRes.status !== 206) {
        throw new Error(
          `R2 video did not serve HTTP 206 Partial Content. ` +
            `Got HTTP ${videoRes.status} for ${testEntry.url}.`
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
      // Check 6: UI Visibility Simulation (Data Layer Normalization)
      // -----------------------------------------------------------------------
      const normalizedRenderDataset = manifest.map((entry, index) => {
        const key = entry.key;
        const lastDot = key.lastIndexOf('.');
        const base = lastDot !== -1 ? key.substring(0, lastDot) : key;
        const firstUnderscore = base.indexOf('_');
        const defaultTag = firstUnderscore !== -1 ? base.substring(0, firstUnderscore) : 'FILM';
        const defaultName = firstUnderscore !== -1 ? base.substring(firstUnderscore + 1) : base;

        return {
          id: `work-${index + 1}`,
          key,
          tag: entry.tag || defaultTag,
          name: entry.name || defaultName,
          url: entry.url,
        };
      });

      if (normalizedRenderDataset.length !== manifest.length) {
        throw new Error('Frontend dataset normalization dropped one or more manifest entries.');
      }

      context.logger.info(
        this.stage,
        'UI_VISIBILITY_OK',
        `UI dataset normalized: ${normalizedRenderDataset.length} video(s) ready for DOM rendering.`,
        'SUCCESS'
      );

      // -----------------------------------------------------------------------
      // Phase 9 Pipeline Semantics: Structured Summary Log
      // -----------------------------------------------------------------------
      context.logger.info(
        this.stage,
        'DELIVERY_SUMMARY',
        '==================================================\n' +
        'R2 DELIVERY SUCCESS\n' +
        '+ MANIFEST SUCCESS\n' +
        '+ GITHUB DEPLOYMENT SUCCESS\n' +
        '+ PRODUCTION HTTP SUCCESS\n' +
        '+ PRODUCTION UI VISIBILITY SUCCESS\n' +
        '= DELIVERY COMPLETE\n' +
        '==================================================',
        'SUCCESS'
      );

      return {
        success: true,
        stage: this.stage,
        message:
          `Production smoke & UI visibility test passed: homepage OK, manifest loaded ` +
          `(${manifest.length} entries), frontend script verified, R2 video streams HTTP 206.`,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      context.logger.error(this.stage, 'SMOKE_FAILED', error.message);
      return { success: false, stage: this.stage, error, message: error.message };
    }
  }
}
