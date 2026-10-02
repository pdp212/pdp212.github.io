/**
 * Git Cleanup Service
 * Identifies and removes legacy local project video fallback files from Git tracking and filesystem.
 * Strictly preserves UI transition videos under assets/transitions/*.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { GitClient } from './git-client.js';
import { GitSafetyError } from '../../core/errors/pipeline-errors.js';

export interface CleanupResult {
  untrackedCount: number;
  files: string[];
  removedLocalCount: number;
  removedLocalFiles: string[];
}

export class GitCleanupService {
  private static readonly VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.avi', '.webm'];

  constructor(private readonly gitClient: GitClient) {}

  /**
   * Scans Git index for tracked video binaries in forbidden paths.
   */
  public async findTrackedProjectVideos(cwd?: string): Promise<string[]> {
    const res = await this.gitClient.exec(['ls-files'], cwd);
    if (res.exitCode !== 0) {
      throw new GitSafetyError(`Failed to inspect Git tracked files: ${res.stderr}`);
    }

    if (!res.stdout) return [];

    const allTracked = res.stdout.split('\n').map((l) => l.trim()).filter(Boolean);

    return allTracked.filter((filePath) => {
      // Strictly protect assets/transitions/
      if (filePath.startsWith('assets/transitions/')) {
        return false;
      }

      // Flag forbidden project video paths
      const isUnderProjectVideos = filePath.startsWith('assets/videos/projects/');
      const hasVideoExt = GitCleanupService.VIDEO_EXTENSIONS.some((ext) =>
        filePath.toLowerCase().endsWith(ext)
      );

      return isUnderProjectVideos && hasVideoExt;
    });
  }

  /**
   * Finds local video files on the filesystem under assets/videos/projects/.
   */
  public findLocalProjectVideos(rootDir: string): string[] {
    const targetDir = path.resolve(rootDir, 'assets/videos/projects');
    if (!fs.existsSync(targetDir)) {
      return [];
    }

    const found: string[] = [];
    try {
      const entries = fs.readdirSync(targetDir);
      for (const entry of entries) {
        const fullPath = path.join(targetDir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          const hasVideoExt = GitCleanupService.VIDEO_EXTENSIONS.some((ext) =>
            entry.toLowerCase().endsWith(ext)
          );
          if (hasVideoExt) {
            found.push(path.relative(rootDir, fullPath));
          }
        }
      }
    } catch {
      // If directory is unreadable or empty, return found
    }

    return found;
  }

  /**
   * Untracks project video binaries from Git and cleans local fallback files from disk.
   */
  public async removeTrackedBinaries(
    rootDir: string,
    isDryRun = false,
    cwd?: string
  ): Promise<CleanupResult> {
    const trackedFiles = await this.findTrackedProjectVideos(cwd);
    const localFiles = this.findLocalProjectVideos(rootDir);

    // 1. Untrack from Git index if any tracked
    if (trackedFiles.length > 0 && !isDryRun) {
      const rmArgs = ['rm', '--cached', '--', ...trackedFiles];
      const rmRes = await this.gitClient.exec(rmArgs, cwd);
      if (rmRes.exitCode !== 0) {
        throw new GitSafetyError(`Failed to untrack Git video binaries: ${rmRes.stderr}`);
      }
    }

    // 2. Remove local files from disk if any exist
    const removedLocalFiles: string[] = [];
    if (localFiles.length > 0) {
      for (const relPath of localFiles) {
        const fullPath = path.resolve(rootDir, relPath);
        if (fs.existsSync(fullPath)) {
          if (!isDryRun) {
            fs.unlinkSync(fullPath);
          }
          removedLocalFiles.push(relPath);
        }
      }
    }

    return {
      untrackedCount: trackedFiles.length,
      files: trackedFiles,
      removedLocalCount: removedLocalFiles.length,
      removedLocalFiles,
    };
  }
}
