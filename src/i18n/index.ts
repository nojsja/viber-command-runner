import * as vscode from 'vscode';
import { MessageKey, MessageParams, messageCatalog, translate, UiLanguage } from './messages';

export type { MessageKey, MessageParams, UiLanguage };

export function getUiLanguage(): UiLanguage {
  const value = vscode.workspace.getConfiguration('viberCommandRunner').get<string>('uiLanguage', 'en');
  return value === 'zh' ? 'zh' : 'en';
}

export function createTranslator(locale: UiLanguage) {
  return {
    locale,
    t(key: MessageKey, params?: MessageParams): string {
      return translate(locale, key, params);
    },
  };
}

export function t(key: MessageKey, params?: MessageParams): string {
  return translate(getUiLanguage(), key, params);
}

export { messageCatalog, translate };
