/**
 * Phase 10 Unit Tests: Desktop Tool Packaging & Configuration
 *
 * Tests:
 * 1. Desktop package entrypoints exist and compile
 * 2. Package.json defines required scripts: desktop:dev, desktop:build, desktop:package
 * 3. Desktop application functions export correctly
 */

import test, { describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageJsonPath = path.resolve(process.cwd(), 'package.json');

describe('Phase 10: Desktop Packaging Configuration', () => {
  test('package.json contains all required desktop scripts', () => {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    assert.ok(pkg.scripts['desktop:dev'], 'Missing desktop:dev script');
    assert.ok(pkg.scripts['desktop:build'], 'Missing desktop:build script');
    assert.ok(pkg.scripts['desktop:package'], 'Missing desktop:package script');
    assert.strictEqual(pkg.main, 'dist/app/desktop/main.js');
  });

  test('desktop entrypoint module exports startDesktopApp and createWindow', async () => {
    const desktopModule = await import('../../app/desktop/main.js');
    assert.strictEqual(typeof desktopModule.startDesktopApp, 'function');
    assert.strictEqual(typeof desktopModule.createWindow, 'function');
  });
});
