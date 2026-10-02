/**
 * Manifest Diff Unit Tests
 * Verifies precise change detection: added, updated, unchanged, removed, and summary formatting.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ManifestDiff } from '../../engines/manifest/manifest-diff.js';
import type { ManifestEntry } from '../../pipeline/context.js';

describe('ManifestDiff Unit Tests', () => {
  const publicBaseUrl = 'https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev';

  it('20. manifest diff: computes added, updated, unchanged, and removed accurately', () => {
    const before: ManifestEntry[] = [
      {
        key: 'DOC_STREET_DN.mp4',
        url: `${publicBaseUrl}/DOC_STREET_DN.mp4`,
        tag: 'DOC',
        name: 'STREET_DN',
      },
      {
        key: 'WED_PHUNGTUONG.mp4',
        url: `${publicBaseUrl}/old-url.mp4`,
        tag: 'WED',
        name: 'PHUNGTUONG',
      },
      {
        key: 'OLD_PROJECT.mp4',
        url: `${publicBaseUrl}/OLD_PROJECT.mp4`,
        tag: 'OLD',
        name: 'PROJECT',
      },
    ];

    const after: ManifestEntry[] = [
      // DOC_STREET_DN is unchanged
      {
        key: 'DOC_STREET_DN.mp4',
        url: `${publicBaseUrl}/DOC_STREET_DN.mp4`,
        tag: 'DOC',
        name: 'STREET_DN',
      },
      // WED_PHUNGTUONG is updated (URL changed)
      {
        key: 'WED_PHUNGTUONG.mp4',
        url: `${publicBaseUrl}/new-url.mp4`,
        tag: 'WED',
        name: 'PHUNGTUONG',
      },
      // MOTION_BRAND_FILM is newly added
      {
        key: 'MOTION_BRAND_FILM.mp4',
        url: `${publicBaseUrl}/MOTION_BRAND_FILM.mp4`,
        tag: 'MOTION',
        name: 'BRAND_FILM',
      },
      // OLD_PROJECT was removed (not present in after)
    ];

    const diff = ManifestDiff.calculate(before, after);

    assert.equal(diff.addedCount, 1);
    assert.equal(diff.added[0].key, 'MOTION_BRAND_FILM.mp4');

    assert.equal(diff.updatedCount, 1);
    assert.equal(diff.updated[0].key, 'WED_PHUNGTUONG.mp4');

    assert.equal(diff.unchangedCount, 1);
    assert.equal(diff.unchanged[0].key, 'DOC_STREET_DN.mp4');

    assert.equal(diff.removedCount, 1);
    assert.equal(diff.removed[0].key, 'OLD_PROJECT.mp4');

    assert.equal(diff.totalBefore, 3);
    assert.equal(diff.totalAfter, 3);

    // Verify ASCII summary box structure
    assert.ok(diff.summaryText.includes('MANIFEST UPDATE'));
    assert.ok(diff.summaryText.includes('Added'));
    assert.ok(diff.summaryText.includes('Updated'));
    assert.ok(diff.summaryText.includes('Removed'));
  });
});
