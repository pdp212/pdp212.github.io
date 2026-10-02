/**
 * Step 6: Atomic Manifest Update
 * Updates portfolio data/work-manifest.json with verified R2 keys and CDN URLs.
 * Strict verification gate: Only items with r2ObjectVerified=true and streamVerified=true are allowed.
 */

import path from 'node:path';
import type { PipelineStep, StepResult } from './step-interface.js';
import type { PipelineContext, ManifestEntry } from '../context.js';
import {
  ManifestReader,
  ManifestValidator,
  ManifestWriter,
  ManifestDiff,
  extractTagAndName,
  mergeAndSortManifestEntries,
} from '../../engines/manifest/index.js';
import { ManifestError } from '../../core/errors/pipeline-errors.js';

export class UpdateManifestStep implements PipelineStep {
  public readonly stage = 'UPDATING_MANIFEST' as const;
  public readonly name = 'Work Manifest Atomic Sync';

  public async execute(context: PipelineContext): Promise<StepResult> {
    context.logger.info(this.stage, 'START', 'Planning atomic work-manifest update...');

    try {
      const portfolioRoot = path.resolve(process.cwd(), context.config.portfolioPath || '../');
      const manifestRelativePath = context.config.manifest?.relativeFilePath || 'data/work-manifest.json';
      const publicBaseUrl = context.config.r2?.publicBaseUrl;
      const tempDir = path.resolve(process.cwd(), context.config.directories?.temp || './temp');

      if (!publicBaseUrl) {
        throw new ManifestError('Missing required config: r2.publicBaseUrl');
      }

      // 1. Read existing manifest
      const reader = new ManifestReader(portfolioRoot, manifestRelativePath, { allowCreateNew: true });
      const manifestBefore = reader.read();

      // 2. Validate existing manifest
      const existingValidation = ManifestValidator.validate(manifestBefore, { publicBaseUrl });
      if (!existingValidation.valid) {
        throw new ManifestError(
          `Existing manifest is invalid: ${existingValidation.errors.join('; ')}`
        );
      }

      // 3. Verification Gate (Section 12)
      // Check each pipeline item. All items targeted for manifest must be verified.
      const incomingEntries: ManifestEntry[] = [];

      for (const item of context.items || []) {
        const isR2Verified = item.r2ObjectVerified === true;
        const isStreamVerified = item.streamVerified === true || item.http206Verified === true;

        if (!isR2Verified || !isStreamVerified) {
          throw new ManifestError(
            `Item '${item.targetKey || item.filename}' failed R2 object or HTTP 206 stream verification (r2Verified: ${isR2Verified}, streamVerified: ${isStreamVerified}). Update blocked.`
          );
        }

        const key = item.targetKey || item.filename;
        let tag = item.tag;
        let name = item.name;

        // Ensure tag and name are clean or extract deterministically
        if (!tag || !name) {
          const extracted = extractTagAndName(key);
          tag = tag || extracted.tag;
          name = name || extracted.name;
        }

        const normalizedBase = publicBaseUrl.replace(/\/+$/, '');
        const url = item.r2PublicUrl || `${normalizedBase}/${key}`;

        incomingEntries.push({
          key,
          url,
          tag,
          name,
        });
      }

      // 4. Deterministic Merge & Sort
      const manifestAfter = mergeAndSortManifestEntries(manifestBefore, incomingEntries);

      // 5. Validate generated manifest
      const afterValidation = ManifestValidator.validate(manifestAfter, { publicBaseUrl });
      if (!afterValidation.valid) {
        throw new ManifestError(
          `Generated manifest fails validation: ${afterValidation.errors.join('; ')}`
        );
      }

      // 6. Calculate Diff
      const diff = ManifestDiff.calculate(manifestBefore, manifestAfter);

      // Populate Context fields (Section 13)
      context.manifestBefore = manifestBefore;
      context.manifestAfter = manifestAfter;
      context.manifestOriginal = manifestBefore;
      context.manifestUpdated = manifestAfter;
      context.manifestChanges = {
        added: diff.addedCount,
        updated: diff.updatedCount,
        removed: diff.removedCount,
        unchanged: diff.unchangedCount,
        addedKeys: diff.added.map((e) => e.key),
        updatedKeys: diff.updated.map((e) => e.key),
        removedKeys: diff.removed.map((e) => e.key),
      };
      context.addedEntries = diff.added;
      context.updatedEntries = diff.updated;
      context.unchangedEntries = diff.unchanged;

      // 7. Handle Dry-Run
      if (context.isDryRun) {
        context.logger.info(
          this.stage,
          'DRY_RUN',
          `Dry run enabled: Manifest write preview generated without disk mutation.\n${diff.summaryText}`,
          'SUCCESS'
        );
        return {
          success: true,
          stage: this.stage,
          message: `[DryRun] Manifest preview generated (+${diff.addedCount}, ~${diff.updatedCount}, =${diff.unchangedCount}).`,
        };
      }

      // 8. Atomic Write to Disk
      const writer = new ManifestWriter(portfolioRoot, manifestRelativePath, {
        tempDir,
        publicBaseUrl,
      });

      writer.atomicWrite(manifestAfter);

      context.logger.info(
        this.stage,
        'ATOMIC_WRITE_SUCCESS',
        `Successfully wrote and validated manifest atomically.\n${diff.summaryText}`,
        'SUCCESS'
      );

      return {
        success: true,
        stage: this.stage,
        message: `Manifest updated successfully (+${diff.addedCount}, ~${diff.updatedCount}, =${diff.unchangedCount}, total: ${manifestAfter.length}).`,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      context.logger.error(this.stage, 'MANIFEST_UPDATE_ERROR', error.message);
      return {
        success: false,
        stage: this.stage,
        error,
        message: error.message,
      };
    }
  }
}
