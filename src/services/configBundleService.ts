import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { getExtensionVersion } from '../extensionMeta';
import { t } from '../i18n';
import { CustomCommandStore, StoredCustomCommand } from './customCommandStore';
import { PresetCommandStore } from './presetCommandStore';
import { TerminalFoldState, UiStateStore } from './uiStateStore';

export const CONFIG_BUNDLE_VERSION = 1;
export const CONFIG_BUNDLE_MIN_VERSION = 1;
const CONFIG_FILE_FILTER = { JSON: ['json'] };

const KNOWN_SETTINGS_KEYS = [
  'commandsSource',
  'commands',
  'terminalName',
  'shellPath',
  'operator',
  'uiLanguage',
  'silentNotifications',
] as const;

export interface RunnerConfigSettings {
  commandsSource?: string;
  /** @deprecated Legacy import only; preset commands are stored in preset-commands.json */
  commands?: Record<string, string>;
  terminalName?: string;
  shellPath?: string;
  operator?: string;
  uiLanguage?: string;
  silentNotifications?: boolean;
}

export interface RunnerConfigBundle {
  version: number;
  extensionVersion?: string;
  exportedAt: string;
  customCommands?: StoredCustomCommand[];
  presetCommands?: Record<string, string>;
  uiState?: {
    groupFold?: Record<string, boolean>;
    terminalFold?: TerminalFoldState;
    parallelMode?: boolean;
  };
  settings?: RunnerConfigSettings;
}

export interface ConfigBundleParseResult {
  bundle: RunnerConfigBundle;
  warnings: string[];
}

export async function buildConfigBundle(
  folder: vscode.WorkspaceFolder,
  customCommands: CustomCommandStore,
  presetCommands: PresetCommandStore,
  uiState: UiStateStore,
  secrets: vscode.SecretStorage,
): Promise<RunnerConfigBundle> {
  const commands = await customCommands.load();
  const presets = await presetCommands.load();
  const ui = await uiState.load();
  const settings = readWorkspaceSettings(folder);

  return {
    version: CONFIG_BUNDLE_VERSION,
    extensionVersion: getExtensionVersion(),
    exportedAt: new Date().toISOString(),
    customCommands: commands,
    presetCommands: presets,
    uiState: {
      groupFold: { ...ui.groupFold },
      terminalFold: { ...ui.terminalFold },
      parallelMode: ui.parallelMode,
    },
    settings,
  };
}

export async function applyConfigBundle(
  folder: vscode.WorkspaceFolder,
  customCommands: CustomCommandStore,
  presetCommands: PresetCommandStore,
  uiState: UiStateStore,
  secrets: vscode.SecretStorage,
  bundle: RunnerConfigBundle,
): Promise<void> {
  if (bundle.customCommands) {
    await customCommands.replaceAll(bundle.customCommands);
  }

  if (bundle.presetCommands) {
    await presetCommands.replaceAll(bundle.presetCommands);
  } else if (bundle.settings?.commands) {
    await presetCommands.replaceAll(bundle.settings.commands);
  }

  if (bundle.uiState) {
    await uiState.applySnapshot(bundle.uiState);
  }

  if (bundle.settings) {
    await applyWorkspaceSettings(folder, secrets, bundle.settings);
  }
}

export function parseConfigBundle(raw: string): ConfigBundleParseResult {
  const warnings: string[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof SyntaxError ? error.message : undefined;
    throw new Error(detail ? t('config.importInvalidJsonDetail', { detail }) : t('config.importInvalidJson'));
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(t('config.importInvalidFormat'));
  }

  const record = parsed as Record<string, unknown>;
  const version = record.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error(t('config.importMissingVersion'));
  }
  if (version < CONFIG_BUNDLE_MIN_VERSION) {
    throw new Error(
      t('config.importVersionTooOld', {
        version: String(version),
        min: String(CONFIG_BUNDLE_MIN_VERSION),
      }),
    );
  }
  if (version > CONFIG_BUNDLE_VERSION) {
    warnings.push(
      t('config.importNewerVersion', {
        version: String(version),
        current: String(CONFIG_BUNDLE_VERSION),
      }),
    );
  }

  const bundle = normalizeConfigBundle(record, version);
  if (!bundle.customCommands && !bundle.presetCommands && !bundle.uiState && !bundle.settings) {
    throw new Error(t('config.importEmpty'));
  }

  return { bundle, warnings };
}

export async function exportConfigToFile(
  folder: vscode.WorkspaceFolder,
  bundle: RunnerConfigBundle,
): Promise<string | undefined> {
  const defaultUri = vscode.Uri.joinPath(folder.uri, 'viber-command-runner-config.json');
  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: CONFIG_FILE_FILTER,
    saveLabel: t('config.exportSaveLabel'),
  });
  if (!target) {
    return undefined;
  }

  try {
    await fs.writeFile(target.fsPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(t('config.exportWriteFailed', { message }));
  }
  return target.fsPath;
}

export async function importConfigFromFile(folder: vscode.WorkspaceFolder): Promise<ConfigBundleParseResult | undefined> {
  const defaultUri = vscode.Uri.joinPath(folder.uri, 'viber-command-runner-config.json');
  const picked = await vscode.window.showOpenDialog({
    defaultUri,
    canSelectMany: false,
    filters: CONFIG_FILE_FILTER,
    openLabel: t('config.importOpenLabel'),
  });
  if (!picked?.length) {
    return undefined;
  }

  let raw: string;
  try {
    raw = await fs.readFile(picked[0].fsPath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(t('config.importReadFailed', { message }));
  }

  if (!raw.trim()) {
    throw new Error(t('config.importEmptyFile'));
  }

  return parseConfigBundle(raw);
}

function normalizeConfigBundle(record: Record<string, unknown>, version: number): RunnerConfigBundle {
  const bundle: RunnerConfigBundle = {
    version,
    exportedAt: readString(record.exportedAt) ?? new Date().toISOString(),
  };

  const extensionVersion = readString(record.extensionVersion);
  if (extensionVersion) {
    bundle.extensionVersion = extensionVersion;
  }

  if ('customCommands' in record) {
    bundle.customCommands = normalizeImportedCustomCommands(record.customCommands);
  }

  if (record.presetCommands && typeof record.presetCommands === 'object' && !Array.isArray(record.presetCommands)) {
    const presetCommands = readStringRecord(record.presetCommands);
    if (presetCommands) {
      bundle.presetCommands = presetCommands;
    }
  }

  if (record.uiState && typeof record.uiState === 'object' && !Array.isArray(record.uiState)) {
    const uiState = normalizeUiState(record.uiState as Record<string, unknown>);
    if (uiState) {
      bundle.uiState = uiState;
    }
  }

  if (record.settings && typeof record.settings === 'object' && !Array.isArray(record.settings)) {
    const settings = normalizeSettings(record.settings as Record<string, unknown>);
    if (settings) {
      bundle.settings = settings;
    }
  }

  return bundle;
}

function normalizeUiState(raw: Record<string, unknown>): RunnerConfigBundle['uiState'] | undefined {
  const uiState: NonNullable<RunnerConfigBundle['uiState']> = {};

  if (raw.groupFold && typeof raw.groupFold === 'object' && !Array.isArray(raw.groupFold)) {
    const groupFold: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(raw.groupFold)) {
      if (typeof value === 'boolean') {
        groupFold[key] = value;
      }
    }
    if (Object.keys(groupFold).length > 0) {
      uiState.groupFold = groupFold;
    }
  }

  if (raw.terminalFold && typeof raw.terminalFold === 'object' && !Array.isArray(raw.terminalFold)) {
    const terminalRaw = raw.terminalFold as Record<string, unknown>;
    const terminalFold: Partial<TerminalFoldState> = {};
    if (typeof terminalRaw.sticky === 'boolean') {
      terminalFold.sticky = terminalRaw.sticky;
    }
    if (typeof terminalRaw.panel === 'boolean') {
      terminalFold.panel = terminalRaw.panel;
    }
    if (Object.keys(terminalFold).length > 0) {
      uiState.terminalFold = terminalFold as TerminalFoldState;
    }
  }

  if (typeof raw.parallelMode === 'boolean') {
    uiState.parallelMode = raw.parallelMode;
  }

  return Object.keys(uiState).length > 0 ? uiState : undefined;
}

function normalizeSettings(raw: Record<string, unknown>): RunnerConfigSettings | undefined {
  const settings: RunnerConfigSettings = {};

  for (const key of KNOWN_SETTINGS_KEYS) {
    if (!(key in raw)) {
      continue;
    }

    if (key === 'commands') {
      const commands = readStringRecord(raw.commands);
      if (commands) {
        settings.commands = commands;
      }
      continue;
    }

    if (key === 'silentNotifications') {
      const value = readBoolean(raw.silentNotifications);
      if (value !== undefined) {
        settings.silentNotifications = value;
      }
      continue;
    }

    const value = readString(raw[key]);
    if (value !== undefined) {
      settings[key] = value;
    }
  }

  return Object.keys(settings).length > 0 ? settings : undefined;
}

function readWorkspaceSettings(folder: vscode.WorkspaceFolder): RunnerConfigSettings {
  const config = vscode.workspace.getConfiguration('viberCommandRunner', folder.uri);
  return {
    commandsSource: config.get<string>('commandsSource'),
    terminalName: config.get<string>('terminalName'),
    shellPath: config.get<string>('shellPath'),
    operator: config.get<string>('operator'),
    uiLanguage: config.get<string>('uiLanguage'),
    silentNotifications: config.get<boolean>('silentNotifications'),
  };
}

async function applyWorkspaceSettings(
  folder: vscode.WorkspaceFolder,
  secrets: vscode.SecretStorage,
  settings: RunnerConfigSettings,
): Promise<void> {
  const config = vscode.workspace.getConfiguration('viberCommandRunner', folder.uri);
  const target = vscode.ConfigurationTarget.Workspace;

  if (settings.commandsSource !== undefined) {
    await config.update('commandsSource', settings.commandsSource, target);
  }
  if (settings.terminalName !== undefined) {
    await config.update('terminalName', settings.terminalName, target);
  }
  if (settings.shellPath !== undefined) {
    await config.update('shellPath', settings.shellPath, target);
  }
  if (settings.operator !== undefined) {
    await config.update('operator', settings.operator, target);
  }
  if (settings.uiLanguage !== undefined) {
    await config.update('uiLanguage', settings.uiLanguage, target);
  }
  if (settings.silentNotifications !== undefined) {
    await config.update('silentNotifications', settings.silentNotifications, target);
  }
}

export function normalizeImportedCustomCommands(items: unknown): StoredCustomCommand[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const normalized: StoredCustomCommand[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Partial<StoredCustomCommand>;
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    const command = typeof record.command === 'string' ? record.command.trim().replace(/;$/, '') : '';
    if (!label || !command) {
      continue;
    }
    normalized.push({
      id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : crypto.randomUUID(),
      label,
      command,
      createdAt: typeof record.createdAt === 'string' && record.createdAt ? record.createdAt : new Date().toISOString(),
    });
  }
  return normalized;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      result[key] = entry;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
