/**
 * Manifest Reader
 * Reads and parses portfolio work-manifest.json safely.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ManifestEntry } from '../../pipeline/context.js';
import { ManifestError } from '../../core/errors/pipeline-errors.js';

export interface ManifestReaderOptions {
  allowCreateNew?: boolean;
}

export class ManifestReader {
  constructor(
    private readonly portfolioRoot: string,
    private readonly manifestRelativePath: string,
    private readonly options: ManifestReaderOptions = {}
  ) {}

  public getManifestPath(): string {
    return path.resolve(this.portfolioRoot, this.manifestRelativePath);
  }

  public exists(): boolean {
    return fs.existsSync(this.getManifestPath());
  }

  public read(): ManifestEntry[] {
    const fullPath = this.getManifestPath();
    if (!fs.existsSync(fullPath)) {
      if (this.options.allowCreateNew) {
        return [];
      }
      throw new ManifestError(`Manifest file not found at: ${fullPath}`);
    }

    try {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      if (raw.trim() === '') {
        if (this.options.allowCreateNew) {
          return [];
        }
        throw new ManifestError(`Manifest file at ${fullPath} is empty`);
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new ManifestError(`Manifest file must contain a JSON array, got ${typeof parsed}`);
      }
      return parsed as ManifestEntry[];
    } catch (err) {
      if (err instanceof ManifestError) {
        throw err;
      }
      throw new ManifestError(`Malformed JSON in manifest at ${fullPath}: ${(err as Error).message}`);
    }
  }
}
