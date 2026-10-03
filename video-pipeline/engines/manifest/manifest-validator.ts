/**
 * Manifest Validator
 * Ensures each manifest entry conforms to portfolio schema, HTTPS URLs, security rules, and uniqueness.
 */

import path from 'node:path';
import type { ManifestEntry } from '../../pipeline/context.js';
import { ManifestError } from '../../core/errors/pipeline-errors.js';

export interface ManifestValidatorOptions {
  publicBaseUrl?: string;
  supportedExtensions?: string[];
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ExtractedMetadata {
  tag: string;
  name: string;
}

/**
 * Parses TAG and NAME deterministically from filename or key.
 * Supports: TAG_NAME.mp4, TAG_NAME.type.mp4, TAG_NAME.mov, etc.
 * Example: WED_PHUNGTUONG.wed.mp4 -> tag: WED, name: PHUNGTUONG
 * Example: MOTION_BRAND_FILM.mov -> tag: MOTION, name: BRAND_FILM
 */
export function extractTagAndName(filenameOrKey: string): ExtractedMetadata {
  const clean = filenameOrKey.trim();
  const ext = path.extname(clean);
  if (!ext) {
    throw new ManifestError(`Cannot extract tag and name: filename '${filenameOrKey}' has no extension`);
  }
  const withoutExt = clean.slice(0, -ext.length);
  const dotIndex = withoutExt.lastIndexOf('.');
  const base = dotIndex !== -1 ? withoutExt.slice(0, dotIndex) : withoutExt;

  const firstUnderscore = base.indexOf('_');
  if (firstUnderscore <= 0) {
    throw new ManifestError(`Cannot parse tag and name deterministically from '${filenameOrKey}'. Expected TAG_NAME format.`);
  }

  const tag = base.slice(0, firstUnderscore).toUpperCase();
  const name = base.slice(firstUnderscore + 1);

  if (!tag || !name) {
    throw new ManifestError(`Invalid extracted tag or name from '${filenameOrKey}'.`);
  }

  return { tag, name };
}

/**
 * Deterministically merges existing and incoming entries by key, updating existing keys and sorting ascending by key.
 */
export function mergeAndSortManifestEntries(
  existing: ManifestEntry[],
  incoming: ManifestEntry[]
): ManifestEntry[] {
  const map = new Map<string, ManifestEntry>();

  for (const item of existing) {
    map.set(item.key, { ...item });
  }

  for (const item of incoming) {
    map.set(item.key, { ...item });
  }

  const result = Array.from(map.values());
  result.sort((a, b) => a.key.localeCompare(b.key));
  return result;
}

const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,
  /aws_access_key_id/i,
  /secret_access_key/i,
  /bearer\s+[a-zA-Z0-9_\-\.]+/i,
  /token=[a-zA-Z0-9_\-\.]+/i,
  /auth=[a-zA-Z0-9_\-\.]+/i,
  /password=[a-zA-Z0-9_\-\.]+/i,
  /secret=[a-zA-Z0-9_\-\.]+/i,
];

const DEFAULT_SUPPORTED_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.avi', '.mxf', '.webm'];

export class ManifestValidator {
  /**
   * Validates an entire manifest array.
   */
  public static validate(
    entries: unknown,
    options: ManifestValidatorOptions = {}
  ): ManifestValidationResult {
    const errors: string[] = [];

    if (!Array.isArray(entries)) {
      return {
        valid: false,
        errors: [`Manifest root must be an array, got ${typeof entries}`],
      };
    }

    const keysSeen = new Set<string>();
    const urlsSeen = new Set<string>();
    const allowedExts = (options.supportedExtensions || DEFAULT_SUPPORTED_EXTENSIONS).map((e) =>
      e.toLowerCase()
    );

    for (let i = 0; i < entries.length; i++) {
      const item = entries[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push(`Entry #${i} must be a valid object, got ${typeof item}`);
        continue;
      }

      const { key, url, tag, name } = item as Record<string, unknown>;
      const itemIdentifier = typeof key === 'string' && key.trim() !== '' ? key : `#${i}`;

      // 1. Key validation
      if (typeof key !== 'string' || key.trim() === '') {
        errors.push(`Entry #${i} missing valid 'key'.`);
      } else {
        const trimmedKey = key.trim();
        const ext = path.extname(trimmedKey).toLowerCase();
        if (!ext || !allowedExts.includes(ext)) {
          errors.push(`Entry '${trimmedKey}' key must have a valid video extension (${allowedExts.join(', ')}).`);
        }
        if (trimmedKey.includes('/') || trimmedKey.includes('\\') || trimmedKey.includes('..')) {
          errors.push(`Entry '${trimmedKey}' key contains illegal path characters.`);
        }
        if (keysSeen.has(trimmedKey)) {
          errors.push(`Duplicate key detected in manifest: '${trimmedKey}'.`);
        }
        keysSeen.add(trimmedKey);
      }

      // 2. URL validation
      if (typeof url !== 'string' || url.trim() === '') {
        errors.push(`Entry '${itemIdentifier}' missing valid 'url'.`);
      } else {
        const trimmedUrl = url.trim();

        // Must start with https://
        if (!trimmedUrl.startsWith('https://')) {
          errors.push(`Entry '${itemIdentifier}' URL must use HTTPS ('${trimmedUrl}').`);
        }

        // Must match publicBaseUrl if provided
        if (options.publicBaseUrl) {
          const expectedPrefix = options.publicBaseUrl.replace(/\/+$/, '');
          if (!trimmedUrl.startsWith(expectedPrefix)) {
            errors.push(`Entry '${itemIdentifier}' URL does not match configured R2 publicBaseUrl '${expectedPrefix}'.`);
          }
        }

        // Forbidden paths and endpoints
        if (trimmedUrl.includes('localhost') || trimmedUrl.includes('127.0.0.1')) {
          errors.push(`Entry '${itemIdentifier}' URL references forbidden localhost.`);
        }
        if (trimmedUrl.includes('file://')) {
          errors.push(`Entry '${itemIdentifier}' URL references forbidden file:// protocol.`);
        }
        if (
          trimmedUrl.includes('/Users/') ||
          trimmedUrl.includes('/Volumes/') ||
          trimmedUrl.startsWith('/') ||
          trimmedUrl.startsWith('./') ||
          trimmedUrl.startsWith('../')
        ) {
          errors.push(`Entry '${itemIdentifier}' URL references local filesystem path.`);
        }
        if (trimmedUrl.includes('assets/videos/projects/')) {
          errors.push(`Entry '${itemIdentifier}' URL references forbidden Git fallback path 'assets/videos/projects/'.`);
        }

        if (urlsSeen.has(trimmedUrl)) {
          errors.push(`Duplicate URL detected in manifest: '${trimmedUrl}'.`);
        }
        urlsSeen.add(trimmedUrl);
      }

      // 3. Tag validation
      if (typeof tag !== 'string' || tag.trim() === '') {
        errors.push(`Entry '${itemIdentifier}' missing valid 'tag'.`);
      }

      // 4. Name validation
      if (typeof name !== 'string' || name.trim() === '') {
        errors.push(`Entry '${itemIdentifier}' missing valid 'name'.`);
      }

      // 5. Security / Secret leak audit
      const fullText = JSON.stringify(item);
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(fullText)) {
          errors.push(`Entry '${itemIdentifier}' contains forbidden secret or credential pattern.`);
          break;
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
