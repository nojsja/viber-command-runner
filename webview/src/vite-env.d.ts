/// <reference types="vite/client" />

import type { PanelMessage } from './types';

export interface VsCodeApi {
  getState(): unknown;
  setState(state: unknown): void;
  postMessage(message: PanelMessage | { type: 'confirmResponse'; confirmed: boolean }): void;
}

declare global {
  interface Window {
    __VIBER_I18N__?: {
      locale: 'en' | 'zh';
      catalog: Record<string, Record<string, string>>;
    };
    acquireVsCodeApi?: () => VsCodeApi;
  }

  function acquireVsCodeApi(): VsCodeApi;
}

export {};
