import * as vscode from 'vscode';
import { t } from '../i18n';
import { CustomCommandStore } from './customCommandStore';
import { ReleaseCommandDefinition, CommandGroupDefinition } from '../types';

function detectPlatform(label: string, command: string) {
  const text = `${label} ${command}`.toLowerCase();
  if (text.includes('shorebird')) {
    return 'shorebird' as const;
  }
  if (text.includes('install-android') || text.includes('install-ios')) {
    return 'install' as const;
  }
  if (text.includes('ios') || text.includes('ipa') || text.includes('xcode')) {
    return 'ios' as const;
  }
  if (text.includes('android') || text.includes('apk') || text.includes('aab')) {
    return 'android' as const;
  }
  return 'other' as const;
}

function detectReleaseType(label: string, command: string): string {
  const text = `${label} ${command}`.toLowerCase();
  if (text.includes('dry-run') || text.includes('dry run')) {
    return 'dry-run';
  }
  if (text.includes('release-dev-env')) {
    return 'release-dev-env';
  }
  if (text.includes('release-adhoc') || text.includes('adhoc')) {
    return 'release-adhoc';
  }
  if (text.includes('profile')) {
    return 'profile';
  }
  if (text.includes('--prod') || text.includes(' prod ') || text.includes('生产')) {
    return 'prod';
  }
  if (text.includes('--dev') || text.includes(' dev ') || text.includes('测试')) {
    return 'dev';
  }
  if (text.includes('patch')) {
    return 'patch';
  }
  if (text.includes('install')) {
    return 'install';
  }
  return 'unknown';
}

function detectDestinations(label: string, command: string): string[] {
  const text = `${label} ${command}`.toLowerCase();
  const destinations: string[] = [];
  if (text.includes('pgyer') || text.includes('蒲公英')) {
    destinations.push('pgyer');
  }
  if (text.includes('firebase')) {
    destinations.push('firebase');
  }
  if (text.includes('app-store') || text.includes('testflight')) {
    destinations.push('app-store');
  }
  if (text.includes('play')) {
    destinations.push('play-internal');
  }
  if (text.includes('notify-wecom') || text.includes('wecom')) {
    destinations.push('wecom');
  }
  if (text.includes('install-android') || text.includes('install-ios')) {
    destinations.push('local-device');
  }
  if (destinations.length === 0) {
    destinations.push('local-build');
  }
  return destinations;
}

function parseOrder(label: string): number {
  const match = label.match(/^(\d+)\./);
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function hasPositionalDeviceArg(command: string): boolean {
  const match = command.match(/\.sh(?:\s+|$)([\s\S]*)$/);
  if (!match) {
    return false;
  }
  const tail = match[1]
    .replace(/(?:^|\s)--[\w-]+(?:=\S+|\s+\S+)?/g, ' ')
    .replace(/;\s*$/, '')
    .trim();
  return tail.length > 0;
}

function detectInteractive(label: string, command: string): boolean {
  const text = `${label} ${command}`.toLowerCase();

  if (/install-android\.sh|install-ios\.sh/.test(text)) {
    return true;
  }

  if (/build-and-install-android\.sh/.test(text)) {
    if (/\b--aab\b/.test(text)) {
      return false;
    }
    return !hasPositionalDeviceArg(command);
  }

  if (/build-and-install-ios\.sh/.test(text)) {
    if (/\b--release-adhoc\b/.test(text) || /\b--testflight\b/.test(text)) {
      return false;
    }
    if (/\b--profile\b/.test(text) || /\b--install\b/.test(text) || /\b--debug\b/.test(text)) {
      return !hasPositionalDeviceArg(command);
    }
    return false;
  }

  return false;
}

export function buildCommandDefinition(
  key: string,
  label: string,
  command: string,
  options?: { order?: number; groupId?: string; customId?: string; releaseType?: string },
): ReleaseCommandDefinition {
  const trimmed = command.trim().replace(/;$/, '');
  return {
    key,
    label,
    command: trimmed,
    platform: detectPlatform(label, trimmed),
    releaseType: options?.releaseType ?? detectReleaseType(label, trimmed),
    destinations: detectDestinations(label, trimmed),
    order: options?.order ?? parseOrder(label),
    interactive: detectInteractive(label, trimmed),
    groupId: options?.groupId,
    customId: options?.customId,
  };
}

export function loadReleaseCommands(folder: vscode.WorkspaceFolder): ReleaseCommandDefinition[] {
  const config = vscode.workspace.getConfiguration(undefined, folder.uri);
  const raw = config.get<Record<string, string>>('command-runner.commands') ?? {};

  return Object.entries(raw)
    .map(([label, command]) =>
      buildCommandDefinition(label, label, command, { groupId: 'release' }),
    )
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'zh-CN'));
}

export async function loadCustomCommands(store: CustomCommandStore): Promise<ReleaseCommandDefinition[]> {
  const items = await store.load();
  return items.map((item, index) =>
    buildCommandDefinition(`custom:${item.id}`, item.label, item.command, {
      groupId: 'custom',
      customId: item.id,
      order: index,
      releaseType: 'custom',
    }),
  );
}

export function buildCommandGroups(
  releaseCommands: ReleaseCommandDefinition[],
  customCommands: ReleaseCommandDefinition[],
): CommandGroupDefinition[] {
  return [
    { id: 'release', title: t('group.release'), commands: releaseCommands },
    { id: 'custom', title: t('group.custom'), commands: customCommands },
  ];
}

export function flattenCommands(groups: CommandGroupDefinition[]): ReleaseCommandDefinition[] {
  return groups.flatMap((group) => group.commands);
}

export function findCommandDefinition(
  groups: CommandGroupDefinition[],
  commandKey: string,
): ReleaseCommandDefinition | undefined {
  for (const group of groups) {
    const found = group.commands.find((item) => item.key === commandKey);
    if (found) {
      return found;
    }
  }
  return undefined;
}
