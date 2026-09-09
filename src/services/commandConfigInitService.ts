import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { CONFIG_SECTION } from '../config';
import { getUiLanguage, t } from '../i18n';
import { CustomCommandStore } from './customCommandStore';
import { PresetCommandStore } from './presetCommandStore';

const COMMAND_RUNNER_SECTION = 'command-runner';
const SETTINGS_DIR = '.vscode';
const SETTINGS_FILE = 'settings.json';

export interface CommandConfigInitStatus {
  initialized: boolean;
  settingsPath: string;
  hasCommandRunnerCommands: boolean;
  hasPresetCommands: boolean;
  hasCustomCommands: boolean;
  commandRunnerCommandCount: number;
  presetCommandCount: number;
  customCommandCount: number;
}

function getSettingsPath(folder: vscode.WorkspaceFolder): string {
  return path.join(folder.uri.fsPath, SETTINGS_DIR, SETTINGS_FILE);
}

function countStringRecord(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 0;
  }
  return Object.values(value as Record<string, unknown>).filter((item) => typeof item === 'string' && item.trim()).length;
}

function buildDefaultWorkspaceSettings(): Record<string, unknown> {
  return {
    [`${CONFIG_SECTION}.commandsSource`]: 'command-runner',
    [`${CONFIG_SECTION}.terminalName`]: 'Viber Workbench',
    [`${CONFIG_SECTION}.uiLanguage`]: getUiLanguage(),
    [`${CONFIG_SECTION}.shellPath`]: '',
    [`${CONFIG_SECTION}.operator`]: '',
    [`${CONFIG_SECTION}.silentNotifications`]: false,
    [`${COMMAND_RUNNER_SECTION}.commands`]: {
      '1. Example: List files': 'ls',
      '2. Example: Git status': 'git status',
    },
  };
}

async function readSettingsFile(settingsPath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function detectCommandConfigInit(folder: vscode.WorkspaceFolder): Promise<CommandConfigInitStatus> {
  const settingsPath = getSettingsPath(folder);
  const workspaceConfig = vscode.workspace.getConfiguration(undefined, folder.uri);
  const commandRunnerCommands = workspaceConfig.get<Record<string, string>>(`${COMMAND_RUNNER_SECTION}.commands`) ?? {};
  const commandRunnerCommandCount = countStringRecord(commandRunnerCommands);

  const presetStore = new PresetCommandStore(folder);
  const customStore = new CustomCommandStore(folder);
  const presetCommands = await presetStore.load();
  const customCommands = await customStore.load();

  const hasCommandRunnerCommands = commandRunnerCommandCount > 0;
  const hasPresetCommands = Object.keys(presetCommands).length > 0;
  const hasCustomCommands = customCommands.length > 0;
  const initialized = hasCommandRunnerCommands || hasPresetCommands || hasCustomCommands;

  return {
    initialized,
    settingsPath,
    hasCommandRunnerCommands,
    hasPresetCommands,
    hasCustomCommands,
    commandRunnerCommandCount,
    presetCommandCount: Object.keys(presetCommands).length,
    customCommandCount: customCommands.length,
  };
}

async function writeSettingsFile(settingsPath: string, settings: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

async function clearManagedCommandStores(folder: vscode.WorkspaceFolder): Promise<void> {
  const presetStore = new PresetCommandStore(folder);
  const customStore = new CustomCommandStore(folder);
  await presetStore.replaceAll({});
  await customStore.replaceAll([]);
  presetStore.invalidateCache();
}

export async function initializeCommandConfig(
  folder: vscode.WorkspaceFolder,
  options: { interactive?: boolean; force?: boolean } = {},
): Promise<{ settingsPath: string; reinitialized: boolean } | undefined> {
  const interactive = options.interactive ?? true;
  const status = await detectCommandConfigInit(folder);
  let force = options.force ?? false;

  if (status.initialized && interactive && !force) {
    const reinitLabel = t('config.initReinit');
    const cancelLabel = t('btn.cancel');
    const confirmed = await vscode.window.showWarningMessage(
      t('config.initConfirmReinit', {
        commands: String(status.commandRunnerCommandCount),
        presets: String(status.presetCommandCount),
        customs: String(status.customCommandCount),
      }),
      { modal: true },
      reinitLabel,
      cancelLabel,
    );
    if (confirmed !== reinitLabel) {
      return undefined;
    }
    force = true;
  }

  const settingsPath = status.settingsPath;
  const existing = await readSettingsFile(settingsPath);
  const defaults = buildDefaultWorkspaceSettings();
  const nextSettings = { ...existing, ...defaults };

  await writeSettingsFile(settingsPath, nextSettings);

  if (force) {
    await clearManagedCommandStores(folder);
  }

  return { settingsPath, reinitialized: force };
}

export async function runCommandConfigInit(
  folder: vscode.WorkspaceFolder,
  options: { interactive?: boolean; force?: boolean } = {},
): Promise<boolean> {
  try {
    const result = await initializeCommandConfig(folder, options);
    if (!result) {
      return false;
    }
    const message = result.reinitialized ? t('config.initReinitialized', { path: result.settingsPath }) : t('config.initSuccess', { path: result.settingsPath });
    void vscode.window.showInformationMessage(message);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(t('config.initFailed', { message }));
    return false;
  }
}
