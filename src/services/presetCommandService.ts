import * as vscode from 'vscode';
import { getExtensionConfigValue } from '../config';
import { PresetCommandStore } from './presetCommandStore';

function normalizeCommand(command: string): string {
  return command.trim().replace(/;$/, '');
}

function normalizeLabel(label: string): string {
  return label.trim();
}

export function getCommandsSource(folder: vscode.WorkspaceFolder): 'command-runner' | 'viberWorkbench' {
  const source = getExtensionConfigValue<string>('commandsSource', 'command-runner', folder.uri);
  return source === 'viberWorkbench' || source === 'viberCommandRunner' ? 'viberWorkbench' : 'command-runner';
}

export function readExternalPresetCommands(folder: vscode.WorkspaceFolder): Record<string, string> {
  if (getCommandsSource(folder) === 'viberWorkbench') {
    return {};
  }
  const config = vscode.workspace.getConfiguration(undefined, folder.uri);
  return config.get<Record<string, string>>('command-runner.commands') ?? {};
}

export async function readManagedPresetCommands(
  folder: vscode.WorkspaceFolder,
  store: PresetCommandStore,
): Promise<Record<string, string>> {
  return store.load();
}

export async function addManagedPresetCommand(
  folder: vscode.WorkspaceFolder,
  store: PresetCommandStore,
  label: string,
  command: string,
): Promise<void> {
  const nextLabel = normalizeLabel(label);
  const nextCommand = normalizeCommand(command);
  const commands = await store.load();
  commands[nextLabel] = nextCommand;
  await store.replaceAll(commands);
}

export async function updateManagedPresetCommand(
  folder: vscode.WorkspaceFolder,
  store: PresetCommandStore,
  presetKey: string,
  label: string,
  command: string,
): Promise<boolean> {
  const nextLabel = normalizeLabel(label);
  const nextCommand = normalizeCommand(command);
  return store.update(presetKey, nextLabel, nextCommand);
}

export async function removeManagedPresetCommand(
  folder: vscode.WorkspaceFolder,
  store: PresetCommandStore,
  presetKey: string,
): Promise<boolean> {
  return store.remove(presetKey);
}
