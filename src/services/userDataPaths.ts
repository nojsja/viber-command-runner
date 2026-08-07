import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const USER_DATA_ROOT = path.join(os.homedir(), '.viber', 'command-runner');

export function getUserDataRoot(): string {
  return USER_DATA_ROOT;
}

export function getWorkspaceDataDir(folder: vscode.WorkspaceFolder): string {
  const hash = crypto.createHash('sha1').update(folder.uri.fsPath).digest('hex').slice(0, 10);
  const slug =
    folder.name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'workspace';
  return path.join(USER_DATA_ROOT, 'workspaces', `${slug}-${hash}`);
}

export async function ensureWorkspaceDataDir(folder: vscode.WorkspaceFolder): Promise<string> {
  const targetDir = getWorkspaceDataDir(folder);
  await fs.mkdir(targetDir, { recursive: true });
  await migrateLegacyWorkspaceData(folder, targetDir);
  return targetDir;
}

async function migrateLegacyWorkspaceData(
  folder: vscode.WorkspaceFolder,
  targetDir: string,
): Promise<void> {
  const legacyDirs = [
    path.join(folder.uri.fsPath, '.viber', 'command-runner'),
    path.join(folder.uri.fsPath, '.goocean', 'release-panel'),
  ];

  for (const legacyDir of legacyDirs) {
    await migrateDirectoryIfNeeded(legacyDir, targetDir);
  }
}

async function migrateDirectoryIfNeeded(sourceDir: string, targetDir: string): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(sourceDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry === 'runs') {
      continue;
    }
    const sourcePath = path.join(sourceDir, entry);
    const targetPath = path.join(targetDir, entry);
    try {
      await fs.access(targetPath);
      continue;
    } catch {
      // target missing, migrate
    }
    try {
      const stat = await fs.stat(sourcePath);
      if (!stat.isFile()) {
        continue;
      }
      await fs.copyFile(sourcePath, targetPath);
    } catch {
      // ignore broken legacy entries
    }
  }
}
