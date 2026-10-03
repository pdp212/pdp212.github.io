/**
 * Desktop Application Entrypoint — Phase 10
 *
 * Wraps the PipelineUiServer in an Electron native desktop window.
 * Features:
 * - Local-first embedded server lifecycle management
 * - Clean shutdown of server on window close / app quit
 * - Native window configuration adhering to Cinematic Brutalism
 */

import electron from 'electron';
import { loadConfiguration } from '../main/index.js';
import { PipelineApplication } from '../application/index.js';
import { PipelineUiServer } from '../ui/server.js';
import { SecretSanitizer } from '../../core/security/secret-sanitizer.js';

const { app, BrowserWindow } = electron;

let mainWindow: electron.BrowserWindow | null = null;
let uiServer: PipelineUiServer | null = null;

export async function startDesktopApp(preferredPort = 3210): Promise<{ url: string; server: PipelineUiServer }> {
  SecretSanitizer.loadEnv();
  const config = loadConfiguration();
  const pipelineApp = new PipelineApplication({ config, isDryRun: false });

  let currentPort = preferredPort;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const server = new PipelineUiServer(pipelineApp.getInputController(), pipelineApp.getLogger(), { port: currentPort });
      const url = await server.start();
      uiServer = server;
      return { url, server };
    } catch (err: any) {
      if (err && err.code === 'EADDRINUSE') {
        currentPort++;
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Could not find available port for desktop UI server.');
}

export function createWindow(url: string): electron.BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 850,
    minWidth: 700,
    minHeight: 600,
    backgroundColor: '#050505',
    title: 'Video Pipeline',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(url);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// When executed directly as Electron main script
if (process.type === 'browser' || process.versions.electron) {
  app.whenReady().then(async () => {
    try {
      const { url } = await startDesktopApp(3210);
      createWindow(url);

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow(url);
        }
      });
    } catch (err) {
      console.error('Failed to start desktop app:', err);
      app.quit();
    }
  });

  app.on('window-all-closed', async () => {
    if (process.platform !== 'darwin') {
      if (uiServer) {
        await uiServer.stop();
      }
      app.quit();
    }
  });

  app.on('before-quit', async () => {
    if (uiServer) {
      await uiServer.stop();
    }
  });
}
