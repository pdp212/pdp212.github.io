/**
 * Manifest Validator Unit Tests
 * Verifies strict validation rules, security checks, and metadata extraction.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ManifestValidator,
  extractTagAndName,
  mergeAndSortManifestEntries,
} from '../../engines/manifest/index.js';
import { ManifestError } from '../../core/errors/pipeline-errors.js';

describe('ManifestValidator Unit Tests', () => {
  const publicBaseUrl = 'https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev';

  it('1. valid manifest: passes with 0 errors', () => {
    const valid = [
      {
        key: 'WED_PHUNGTUONG.wed.mp4',
        url: `${publicBaseUrl}/WED_PHUNGTUONG.wed.mp4`,
        tag: 'WED',
        name: 'PHUNGTUONG',
      },
      {
        key: 'MOTION_BRAND_FILM.mp4',
        url: `${publicBaseUrl}/MOTION_BRAND_FILM.mp4`,
        tag: 'MOTION',
        name: 'BRAND_FILM',
      },
    ];

    const result = ManifestValidator.validate(valid, { publicBaseUrl });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('2. empty manifest: empty array passes validation', () => {
    const result = ManifestValidator.validate([], { publicBaseUrl });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('4. missing key: rejected with descriptive error', () => {
    const entries = [
      {
        key: '',
        url: `${publicBaseUrl}/video.mp4`,
        tag: 'WED',
        name: 'TEST',
      },
    ];
    const result = ManifestValidator.validate(entries, { publicBaseUrl });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("missing valid 'key'")));
  });

  it('5. missing URL: rejected with descriptive error', () => {
    const entries = [
      {
        key: 'WED_SAMPLE.mp4',
        url: '',
        tag: 'WED',
        name: 'SAMPLE',
      },
    ];
    const result = ManifestValidator.validate(entries, { publicBaseUrl });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("missing valid 'url'")));
  });

  it('6. duplicate key: rejected', () => {
    const entries = [
      {
        key: 'WED_SAMPLE.mp4',
        url: `${publicBaseUrl}/WED_SAMPLE_1.mp4`,
        tag: 'WED',
        name: 'SAMPLE',
      },
      {
        key: 'WED_SAMPLE.mp4',
        url: `${publicBaseUrl}/WED_SAMPLE_2.mp4`,
        tag: 'WED',
        name: 'SAMPLE_TWO',
      },
    ];
    const result = ManifestValidator.validate(entries, { publicBaseUrl });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Duplicate key detected")));
  });

  it('7. duplicate URL: rejected', () => {
    const entries = [
      {
        key: 'WED_SAMPLE_A.mp4',
        url: `${publicBaseUrl}/SAME_URL.mp4`,
        tag: 'WED',
        name: 'A',
      },
      {
        key: 'WED_SAMPLE_B.mp4',
        url: `${publicBaseUrl}/SAME_URL.mp4`,
        tag: 'WED',
        name: 'B',
      },
    ];
    const result = ManifestValidator.validate(entries, { publicBaseUrl });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Duplicate URL detected")));
  });

  it('8. HTTP URL rejected: must be HTTPS', () => {
    const entries = [
      {
        key: 'WED_SAMPLE.mp4',
        url: 'http://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev/WED_SAMPLE.mp4',
        tag: 'WED',
        name: 'SAMPLE',
      },
    ];
    const result = ManifestValidator.validate(entries);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('URL must use HTTPS')));
  });

  it('9. localhost rejected', () => {
    const entries = [
      {
        key: 'WED_SAMPLE.mp4',
        url: 'https://localhost:8080/WED_SAMPLE.mp4',
        tag: 'WED',
        name: 'SAMPLE',
      },
    ];
    const result = ManifestValidator.validate(entries);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('forbidden localhost')));
  });

  it('10. local filesystem path rejected', () => {
    const entries1 = [
      {
        key: 'WED_SAMPLE.mp4',
        url: 'file:///Users/sss-phat/video.mp4',
        tag: 'WED',
        name: 'SAMPLE',
      },
    ];
    const result1 = ManifestValidator.validate(entries1);
    assert.equal(result1.valid, false);
    assert.ok(result1.errors.some((e) => e.includes('file://') || e.includes('local filesystem')));

    const entries2 = [
      {
        key: 'WED_SAMPLE.mp4',
        url: '/Volumes/Storage/video.mp4',
        tag: 'WED',
        name: 'SAMPLE',
      },
    ];
    const result2 = ManifestValidator.validate(entries2);
    assert.equal(result2.valid, false);
    assert.ok(result2.errors.some((e) => e.includes('local filesystem path')));
  });

  it('11. Git fallback path rejected', () => {
    const entries = [
      {
        key: 'WED_SAMPLE.mp4',
        url: 'https://example.com/assets/videos/projects/WED_SAMPLE.mp4',
        tag: 'WED',
        name: 'SAMPLE',
      },
    ];
    const result = ManifestValidator.validate(entries);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('assets/videos/projects/')));
  });

  it('12. invalid extension rejected: key must have supported video extension', () => {
    const entries = [
      {
        key: 'WED_SAMPLE.txt',
        url: `${publicBaseUrl}/WED_SAMPLE.txt`,
        tag: 'WED',
        name: 'SAMPLE',
      },
    ];
    const result = ManifestValidator.validate(entries, { publicBaseUrl });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('valid video extension')));
  });

  it('13. valid R2 URL accepted', () => {
    const entries = [
      {
        key: 'DOC_STREET_DN.mp4',
        url: 'https://pub-2cc56f19f7ba4dae92294d5baaa8cfc6.r2.dev/DOC_STREET_DN.mp4',
        tag: 'DOC',
        name: 'STREET_DN',
      },
    ];
    const result = ManifestValidator.validate(entries, { publicBaseUrl });
    assert.equal(result.valid, true);
  });

  it('22. secrets rejected: flags credential patterns in manifest fields', () => {
    const entries = [
      {
        key: 'WED_SAMPLE.mp4',
        url: `${publicBaseUrl}/WED_SAMPLE.mp4?aws_access_key_id=AKIAIOSFODNN7EXAMPLE`,
        tag: 'WED',
        name: 'SAMPLE',
      },
    ];
    const result = ManifestValidator.validate(entries, { publicBaseUrl });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('forbidden secret or credential pattern')));
  });

  it('tag and name extraction works for supported conventions and rejects invalid names', () => {
    const wed = extractTagAndName('WED_PHUNGTUONG.wed.mp4');
    assert.equal(wed.tag, 'WED');
    assert.equal(wed.name, 'PHUNGTUONG');

    const motion = extractTagAndName('MOTION_BRAND_FILM.mov');
    assert.equal(motion.tag, 'MOTION');
    assert.equal(motion.name, 'BRAND_FILM');

    const mv = extractTagAndName('MV_SUMMER_NIGHT.mp4');
    assert.equal(mv.tag, 'MV');
    assert.equal(mv.name, 'SUMMER_NIGHT');

    const doc = extractTagAndName('DOC_STREET_DN.mp4');
    assert.equal(doc.tag, 'DOC');
    assert.equal(doc.name, 'STREET_DN');

    // Reject missing extension
    assert.throws(
      () => extractTagAndName('WED_SAMPLE'),
      (err: any) => err instanceof ManifestError
    );

    // Reject missing underscore
    assert.throws(
      () => extractTagAndName('NOTAG.mp4'),
      (err: any) => err instanceof ManifestError
    );
  });

  it('17. deterministic sorting: sorts entries by key ascending', () => {
    const existing = [
      { key: 'WED_PHUNGTUONG.mp4', url: `${publicBaseUrl}/WED_PHUNGTUONG.mp4`, tag: 'WED', name: 'PHUNGTUONG' },
    ];
    const incoming = [
      { key: 'DOC_STREET_DN.mp4', url: `${publicBaseUrl}/DOC_STREET_DN.mp4`, tag: 'DOC', name: 'STREET_DN' },
      { key: 'MOTION_BRAND_FILM.mp4', url: `${publicBaseUrl}/MOTION_BRAND_FILM.mp4`, tag: 'MOTION', name: 'BRAND_FILM' },
    ];

    const merged = mergeAndSortManifestEntries(existing, incoming);
    assert.equal(merged.length, 3);
    assert.equal(merged[0].key, 'DOC_STREET_DN.mp4');
    assert.equal(merged[1].key, 'MOTION_BRAND_FILM.mp4');
    assert.equal(merged[2].key, 'WED_PHUNGTUONG.mp4');
  });

  it('15 & 16. existing video updated, duplicate video prevented', () => {
    const existing = [
      { key: 'WED_PHUNGTUONG.mp4', url: `${publicBaseUrl}/old.mp4`, tag: 'WED', name: 'OLD' },
    ];
    const incoming = [
      { key: 'WED_PHUNGTUONG.mp4', url: `${publicBaseUrl}/new.mp4`, tag: 'WED', name: 'NEW' },
    ];

    const merged = mergeAndSortManifestEntries(existing, incoming);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].url, `${publicBaseUrl}/new.mp4`);
    assert.equal(merged[0].name, 'NEW');
  });
});
