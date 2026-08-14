import * as vscode from 'vscode';
import { getUiLanguage, messageCatalog, t } from '../i18n';
import { PanelMessage } from '../types';
import { postExtensionMessage, ReleasePanelController } from './ReleasePanelController';

export class ReleaseWindowPanel {
  public static readonly viewType = 'viberWorkbench.window';

  private static currentPanel: ReleaseWindowPanel | undefined;

  private readonly controller: ReleasePanelController;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    secrets: vscode.SecretStorage,
  ) {
    this.controller = new ReleasePanelController(secrets);
    this.controller.onStateChanged = async (state) => {
      postExtensionMessage(this.panel.webview, { type: 'state', payload: state });
    };
    this.controller.onToast = (level, message) => {
      postExtensionMessage(this.panel.webview, { type: 'toast', level, message });
    };
    this.controller.onTerminalClear = (recordId) => {
      postExtensionMessage(this.panel.webview, { type: 'terminalClear', recordId });
    };
    this.controller.onTerminalOutput = (chunk, stream, recordId) => {
      postExtensionMessage(this.panel.webview, { type: 'terminalOutput', chunk, stream, recordId });
    };
    this.controller.onTerminalStarted = (label, recordId, commandKey) => {
      postExtensionMessage(this.panel.webview, { type: 'runStarted', recordId, label, commandKey });
    };
    this.controller.onInteractivePrompt = (prompt, context, shortcuts, recordId) => {
      postExtensionMessage(this.panel.webview, { type: 'interactivePrompt', prompt, context, shortcuts, recordId });
    };
    this.controller.onInteractivePromptDismiss = () => {
      postExtensionMessage(this.panel.webview, { type: 'interactivePromptDismiss' });
    };

    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    };
    this.panel.webview.html = this.renderHtml(extensionUri, this.panel.webview);
    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'rocket.svg');

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: PanelMessage) => void this.handleMessage(message),
      null,
      this.disposables,
    );
  }

  public static createOrShow(extensionUri: vscode.Uri, secrets: vscode.SecretStorage): void {
    if (ReleaseWindowPanel.currentPanel) {
      ReleaseWindowPanel.currentPanel.panel.reveal(vscode.ViewColumn.Active, false);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ReleaseWindowPanel.viewType,
      'Viber Workbench',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      },
    );

    ReleaseWindowPanel.currentPanel = new ReleaseWindowPanel(panel, extensionUri, secrets);
  }

  public static getCurrentController(): ReleasePanelController | undefined {
    return ReleaseWindowPanel.currentPanel?.controller;
  }

  public static reloadCurrentWebview(): boolean {
    if (!ReleaseWindowPanel.currentPanel) {
      return false;
    }
    ReleaseWindowPanel.currentPanel.reloadWebview();
    return true;
  }

  public reloadWebview(): void {
    this.panel.webview.html = this.renderHtml(this.extensionUri, this.panel.webview);
  }

  private async handleMessage(message: PanelMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.loadAndPostState('initial');
        break;
      case 'refresh':
        await this.loadAndPostState('refresh');
        break;
      case 'reloadWebview':
        this.reloadWebview();
        break;
      case 'runCommand': {
        void this.controller.runCommand(message.commandKey);
        break;
      }
      case 'copyCommand': {
        await vscode.env.clipboard.writeText(message.command);
        postExtensionMessage(this.panel.webview, { type: 'toast', level: 'info', message: t('toast.commandCopied') });
        break;
      }
      case 'pasteAdhocCommand': {
        const text = await vscode.env.clipboard.readText();
        postExtensionMessage(this.panel.webview, { type: 'adhocClipboardText', text });
        break;
      }
      case 'runRawCommand': {
        void this.controller.runRawCommand(message.command);
        break;
      }
      case 'addCustomCommand': {
        await this.controller.addCustomCommand(message.label, message.command);
        break;
      }
      case 'updateCustomCommand': {
        await this.controller.updateCustomCommand(message.customId, message.label, message.command);
        break;
      }
      case 'removeCustomCommand': {
        await this.controller.removeCustomCommand(message.customId);
        break;
      }
      case 'addPresetCommand': {
        await this.controller.addPresetCommand(message.label, message.command);
        break;
      }
      case 'updatePresetCommand': {
        await this.controller.updatePresetCommand(message.presetKey, message.label, message.command);
        break;
      }
      case 'removePresetCommand': {
        await this.controller.removePresetCommand(message.presetKey);
        break;
      }
      case 'setGroupFold': {
        void this.controller.setGroupFold(message.groupId, message.open);
        break;
      }
      case 'setParallelMode': {
        void this.controller.setParallelMode(message.enabled).then((state) => {
          postExtensionMessage(this.panel.webview, { type: 'state', payload: state });
        });
        break;
      }
      case 'setTerminalFold': {
        void this.controller.setTerminalFold(message.target, message.expanded).then((state) => {
          postExtensionMessage(this.panel.webview, { type: 'state', payload: state });
        });
        break;
      }
      case 'syncRemote':
        await this.loadAndPostState('sync');
        break;
      case 'exportConfig':
        void this.controller.exportConfig();
        break;
      case 'importConfig':
        void this.controller.importConfig();
        break;
      case 'openTerminal':
        this.controller.openTerminal();
        break;
      case 'clearTerminal':
        postExtensionMessage(this.panel.webview, { type: 'terminalClear', recordId: message.recordId });
        break;
      case 'cancelRun': {
        void this.controller.cancelRun(message.recordId);
        break;
      }
      case 'terminalInput': {
        void this.controller.submitTerminalInput(message.value, message.recordId).then((nextState) => {
          if (nextState) {
            postExtensionMessage(this.panel.webview, { type: 'state', payload: nextState });
          }
        });
        break;
      }
      case 'terminalInterrupt': {
        void this.controller.interruptTerminal(message.recordId).then((nextState) => {
          if (nextState) {
            postExtensionMessage(this.panel.webview, { type: 'state', payload: nextState });
          }
        });
        break;
      }
      default:
        break;
    }
  }

  private dispose(): void {
    ReleaseWindowPanel.currentPanel = undefined;
    this.controller.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  private async loadAndPostState(mode: 'initial' | 'refresh' | 'sync'): Promise<void> {
    const messageKey = mode === 'sync' ? 'loading.sync' : mode === 'refresh' ? 'loading.refresh' : 'loading.initial';
    postExtensionMessage(this.panel.webview, { type: 'loading', active: true, messageKey });
    try {
      if (mode === 'sync') {
        const state = await this.controller.syncRemote(true);
        postExtensionMessage(this.panel.webview, { type: 'state', payload: state });
        return;
      }

      const syncRemote = mode === 'refresh';
      const state = await this.controller.bootstrap(syncRemote);
      postExtensionMessage(this.panel.webview, { type: 'state', payload: state });

      if (mode === 'initial') {
        void this.backgroundSyncRemote();
      }
    } finally {
      postExtensionMessage(this.panel.webview, { type: 'loading', active: false });
    }
  }

  private async backgroundSyncRemote(): Promise<void> {
    const state = await this.controller.syncRemote({ quiet: true, interactive: false });
    postExtensionMessage(this.panel.webview, { type: 'state', payload: state });
  }

  private renderHtml(extensionUri: vscode.Uri, webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'dist', 'panel.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'dist', 'panel.js'));
    const nonce = getNonce();
    const locale = getUiLanguage();
    const htmlLang = locale === 'zh' ? 'zh-CN' : 'en';
    const i18nBootstrap = JSON.stringify({ locale, catalog: messageCatalog }).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Viber Workbench</title>
</head>
<body class="window-mode">
  <div id="root"></div>
  <script nonce="${nonce}">
    window.__VIBER_I18N__ = ${i18nBootstrap};
  </script>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 32; i += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}
