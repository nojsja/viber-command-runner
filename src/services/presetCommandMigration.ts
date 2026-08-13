import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { ensureWorkspaceDataDir, getWorkspaceDataDir } from './userDataPaths';

const PRESET_FILE = 'preset-commands.json';
const LEGACY_CLEARED_MARKER = '.preset-commands-legacy-cleared';

const migrationByFolder = new Map<string, Promise<void>>();

function hasLegacyCommands(
  inspect: ReturnType<vscode.WorkspaceConfiguration['inspect']> | undefined,
): boolean {
  if (!inspect) {
    return false;
  }
  return (
    inspect.globalValue !== undefined
    || inspect.workspaceValue !== undefined
    || inspect.workspaceFolderValue !== undefined
  );
}

function mergeLegacyCommands(
  inspect: NonNullable<ReturnType<vscode.WorkspaceConfiguration['inspect']>>,
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const source of [inspect.globalValue, inspect.workspaceValue, inspect.workspaceFolderValue]) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      continue;
    }
    for (const [label, command] of Object.entries(source as Record<string, unknown>)) {
      if (typeof command === 'string') {
        merged[label] = command;
      }
    }
  }
  return merged;
}

async function markerPath(folder: vscode.WorkspaceFolder): Promise<string> {
  await ensureWorkspaceDataDir(folder);
  return path.join(getWorkspaceDataDir(folder), LEGACY_CLEARED_MARKER);
}

async function markerExists(folder: vscode.WorkspaceFolder): Promise<boolean> {
  try {
    await fs.access(await markerPath(folder));
    return true;
  } catch {
    return false;
  }
}

async function writeMarker(folder: vscode.WorkspaceFolder): Promise<void> {
  await fs.writeFile(await markerPath(folder), new Date().toISOString(), 'utf8');
}

async function readPresetFile(folder: vscode.WorkspaceFolder): Promise<Record<string, string>> {
  const filePath = path.join(getWorkspaceDataDir(folder), PRESET_FILE);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as { commands?: Record<string, string> };
    if (parsed.commands && typeof parsed.commands === 'object' && !Array.isArray(parsed.commands)) {
      return { ...parsed.commands };
    }
  } catch {
    // missing or invalid file
  }
  return {};
}

async function writePresetFile(folder: vscode.WorkspaceFolder, commands: Record<string, string>): Promise<void> {
  const filePath = path.join(getWorkspaceDataDir(folder), PRESET_FILE);
  await fs.writeFile(filePath, JSON.stringify({ version: 1, commands }, null, 2), 'utf8');
}

async function clearLegacyCommandsConfig(
  folder: vscode.WorkspaceFolder,
  inspect: NonNullable<ReturnType<vscode.WorkspaceConfiguration['inspect']>>,
): Promise<void> {
  const config = vscode.workspace.getConfiguration('viberCommandRunner', folder.uri);
  if (inspect.globalValue !== undefined) {
    await config.update('commands', undefined, vscode.ConfigurationTarget.Global);
  }
  if (inspect.workspaceValue !== undefined) {
    await config.update('commands', undefined, vscode.ConfigurationTarget.Workspace);
  }
  if (inspect.workspaceFolderValue !== undefined) {
    await config.update('commands', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
  }
}

async function runMigration(folder: vscode.WorkspaceFolder): Promise<void> {
  const config = vscode.workspace.getConfiguration('viberCommandRunner', folder.uri);
  const inspect = config.inspect<Record<string, string>>('commands');
  const legacyPresent = hasLegacyCommands(inspect);

  if (!legacyPresent && (await markerExists(folder))) {
    return;
  }

  if (!legacyPresent) {
    await writeMarker(folder);
    return;
  }

  const legacy = mergeLegacyCommands(inspect!);
  const existing = await readPresetFile(folder);
  if (Object.keys(existing).length === 0 && Object.keys(legacy).length > 0) {
    await writePresetFile(folder, legacy);
  }

  await clearLegacyCommandsConfig(folder, inspect!);
  await writeMarker(folder);
}

export function migrateLegacyPresetCommands(folder: vscode.WorkspaceFolder): Promise<void> {
  const key = folder.uri.fsPath;
  const pending = migrationByFolder.get(key);
  if (pending) {
    return pending;
  }

  const promise = runMigration(folder).catch((error) => {
    migrationByFolder.delete(key);
    throw error;
  });
  migrationByFolder.set(key, promise);
  return promise;
}
