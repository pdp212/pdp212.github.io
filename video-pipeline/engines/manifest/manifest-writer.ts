/**
 * Atomic Manifest Writer
 * Provides atomic transactional write semantics with backup, verification, and rollback.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ManifestEntry } from '../../pipeline/context.js';
import { ManifestValidator } from './manifest-validator.js';
import { ManifestDiff, type ManifestDiffResult } from './manifest-diff.js';
import { ManifestError } from '../../core/errors/pipeline-errors.js';

export interface ManifestWriterOptions {
  tempDir?: string;
  publicBaseUrl?: string;
}

export class ManifestWriter {
  private readonly tempDir: string;

  constructor(
    private readonly portfolioRoot: string,
    private readonly manifestRelativePath: string,
    private readonly options: ManifestWriterOptions = {}
  ) {
    this.tempDir = options.tempDir
      ? path.resolve(options.tempDir)
      : path.resolve(this.portfolioRoot, 'video-pipeline/temp');
  }

  public getManifestPath(): string {
    return path.resolve(this.portfolioRoot, this.manifestRelativePath);
  }

  public getBackupPath(): string {
    return path.resolve(this.tempDir, 'work-manifest.json.bak');
  }

  public getTempWritePath(): string {
    const fullPath = this.getManifestPath();
    return path.resolve(path.dirname(fullPath), `${path.basename(fullPath)}.tmp`);
  }

  /**
   * Generates a preview diff of what the manifest would look like without writing to disk.
   */
  public preview(newEntries: ManifestEntry[]): {
    currentEntries: ManifestEntry[];
    newEntries: ManifestEntry[];
    diff: ManifestDiffResult;
  } {
    const fullPath = this.getManifestPath();
    let currentEntries: ManifestEntry[] = [];

    if (fs.existsSync(fullPath)) {
      try {
        const raw = fs.readFileSync(fullPath, 'utf-8');
        currentEntries = JSON.parse(raw);
        if (!Array.isArray(currentEntries)) {
          currentEntries = [];
        }
      } catch {
        currentEntries = [];
      }
    }

    const diff = ManifestDiff.calculate(currentEntries, newEntries);
    return {
      currentEntries,
      newEntries,
      diff,
    };
  }

  /**
   * Writes the new manifest atomically:
   * 1. Read & validate current manifest (if exists)
   * 2. Validate new manifest
   * 3. Create transactional backup in temp/
   * 4. Write temporary file
   * 5. Atomic rename
   * 6. Re-read and re-validate from disk
   * 7. Rollback if any step fails
   */
  public atomicWrite(newEntries: ManifestEntry[]): void {
    const fullPath = this.getManifestPath();
    const backupPath = this.getBackupPath();
    const tempPath = this.getTempWritePath();

    // 1. Validate existing manifest if file exists
    if (fs.existsSync(fullPath)) {
      try {
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const existingValidation = ManifestValidator.validate(parsed, {
          publicBaseUrl: this.options.publicBaseUrl,
        });
        if (!existingValidation.valid) {
          throw new ManifestError(
            `Cannot update corrupt or invalid existing manifest: ${existingValidation.errors.join('; ')}`
          );
        }
      } catch (err) {
        if (err instanceof ManifestError) throw err;
        throw new ManifestError(
          `Cannot update corrupt existing manifest JSON at ${fullPath}: ${(err as Error).message}`
        );
      }
    }

    // 2. Validate incoming entries
    const validation = ManifestValidator.validate(newEntries, {
      publicBaseUrl: this.options.publicBaseUrl,
    });
    if (!validation.valid) {
      throw new ManifestError(`Cannot write invalid manifest: ${validation.errors.join('; ')}`);
    }

    // 3. Create backup in temp directory
    const hadExisting = fs.existsSync(fullPath);
    if (hadExisting) {
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(fullPath, backupPath);
    }

    try {
      // 4. Ensure target directory exists and write to temp file
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      const serialized = JSON.stringify(newEntries, null, 2) + '\n';
      fs.writeFileSync(tempPath, serialized, 'utf-8');

      // 5. Atomic rename
      fs.renameSync(tempPath, fullPath);

      // 6. Re-read and validate final manifest from disk
      const finalRaw = fs.readFileSync(fullPath, 'utf-8');
      const finalParsed = JSON.parse(finalRaw);
      const finalValidation = ManifestValidator.validate(finalParsed, {
        publicBaseUrl: this.options.publicBaseUrl,
      });

      if (!finalValidation.valid) {
        throw new ManifestError(
          `Post-write validation failed for manifest at ${fullPath}: ${finalValidation.errors.join('; ')}`
        );
      }
    } catch (err) {
      // Rollback on failure
      this.rollback();
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // ignore cleanup error
        }
      }
      if (err instanceof ManifestError) throw err;
      throw new ManifestError(`Atomic write failed: ${(err as Error).message}`);
    }
  }

  /**
   * Restores the manifest from the backup file if one exists.
   */
  public rollback(): boolean {
    const fullPath = this.getManifestPath();
    const backupPath = this.getBackupPath();

    if (fs.existsSync(backupPath)) {
      try {
        fs.copyFileSync(backupPath, fullPath);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
