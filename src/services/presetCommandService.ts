import * as vscode from 'vscode';

function normalizeCommand(command: string): string {
  return command.trim().replace(/;$/, '');
}

function normalizeLabel(label: string): string {
  return label.trim();
}

export function getCommandsSource(folder: vscode.WorkspaceFolder): 'command-runner' | 'viberCommandRunner' {
  const config = vscode.workspace.getConfiguration('viberCommandRunner', folder.uri);
  const source = config.get<string>('commandsSource');
  return source === 'viberCommandRunner' ? 'viberCommandRunner' : 'command-runner';
}

export function readExternalPresetCommands(folder: vscode.WorkspaceFolder): Record<string, string> {
  if (getCommandsSource(folder) === 'viberCommandRunner') {
    return {};
  }
  const config = vscode.workspace.getConfiguration(undefined, folder.uri);
  return config.get<Record<string, string>>('command-runner.commands') ?? {};
}

export function readManagedPresetCommands(folder: vscode.WorkspaceFolder): Record<string, string> {
  const config = vscode.workspace.getConfiguration('viberCommandRunner', folder.uri);
  return config.get<Record<string, string>>('commands') ?? {};
}

async function writeManagedPresetCommands(
  folder: vscode.WorkspaceFolder,
  commands: Record<string, string>,
): Promise<void> {
  const config = vscode.workspace.getConfiguration('viberCommandRunner', folder.uri);
  await config.update('commands', commands, vscode.ConfigurationTarget.Workspace);
}

export async function addManagedPresetCommand(
  folder: vscode.WorkspaceFolder,
  label: string,
  command: string,
): Promise<void> {
  const nextLabel = normalizeLabel(label);
  const nextCommand = normalizeCommand(command);
  const commands = { ...readManagedPresetCommands(folder) };
  commands[nextLabel] = nextCommand;
  await writeManagedPresetCommands(folder, commands);
}

export async function updateManagedPresetCommand(
  folder: vscode.WorkspaceFolder,
  presetKey: string,
  label: string,
  command: string,
): Promise<boolean> {
  const commands = { ...readManagedPresetCommands(folder) };
  if (!(presetKey in commands)) {
    return false;
  }
  const nextLabel = normalizeLabel(label);
  const nextCommand = normalizeCommand(command);
  if (presetKey !== nextLabel) {
    delete commands[presetKey];
  }
  commands[nextLabel] = nextCommand;
  await writeManagedPresetCommands(folder, commands);
  return true;
}

export async function removeManagedPresetCommand(
  folder: vscode.WorkspaceFolder,
  presetKey: string,
): Promise<boolean> {
  const commands = { ...readManagedPresetCommands(folder) };
  if (!(presetKey in commands)) {
    return false;
  }
  delete commands[presetKey];
  await writeManagedPresetCommands(folder, commands);
  return true;
}
