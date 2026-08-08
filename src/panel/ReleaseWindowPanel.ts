import * as vscode from 'vscode';
import { getUiLanguage, messageCatalog, t } from '../i18n';
import { PanelMessage } from '../types';
import { postExtensionMessage, ReleasePanelController } from './ReleasePanelController';

export class ReleaseWindowPanel {
  public static readonly viewType = 'viberCommandRunner.window';

  private static currentPanel: ReleaseWindowPanel | undefined;

  private readonly controller: ReleasePanelController;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    secrets: vscode.SecretStorage,
  ) {
    this.controller = new ReleasePanelController(secrets);
    this.controller.onStateChanged = async (state) => {
      postExtensionMessage(this.panel.webview, { type: 'state', payload: state });
    };
    this.controller.onToast = (level, message) => {
      postExtensionMessage(this.panel.webview, { type: 'toast', level, message });
    };
    this.controller.onTerminalClear = () => {
      postExtensionMessage(this.panel.webview, { type: 'terminalClear' });
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
      'Viber Command Runner',
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

  private async handleMessage(message: PanelMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.loadAndPostState('initial');
        break;
      case 'refresh':
        await this.loadAndPostState('refresh');
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
        void this.controller.addCustomCommand(message.label, message.command);
        break;
      }
      case 'updateCustomCommand': {
        void this.controller.updateCustomCommand(message.customId, message.label, message.command);
        break;
      }
      case 'removeCustomCommand': {
        void this.controller.removeCustomCommand(message.customId);
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
      case 'syncOss':
        await this.loadAndPostState('sync');
        break;
      case 'openSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', 'viberCommandRunner');
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
        postExtensionMessage(this.panel.webview, { type: 'terminalClear' });
        break;
      case 'cancelRun': {
        void this.controller.cancelRun(message.recordId);
        break;
      }
      case 'terminalInput': {
        this.controller.submitTerminalInput(message.value, message.recordId);
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
        const state = await this.controller.syncOss(true);
        postExtensionMessage(this.panel.webview, { type: 'state', payload: state });
        return;
      }

      const syncOss = mode === 'refresh';
      const state = await this.controller.bootstrap(syncOss);
      postExtensionMessage(this.panel.webview, { type: 'state', payload: state });

      if (mode === 'initial') {
        void this.backgroundSyncOss();
      }
    } finally {
      postExtensionMessage(this.panel.webview, { type: 'loading', active: false });
    }
  }

  private async backgroundSyncOss(): Promise<void> {
    const state = await this.controller.syncOss({ quiet: true, interactive: false });
    postExtensionMessage(this.panel.webview, { type: 'state', payload: state });
  }

  private renderHtml(extensionUri: vscode.Uri, webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.css'));
    const i18nUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'i18n-runtime.js'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.js'));
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
  <title>Viber Command Runner Panel</title>
</head>
<body class="window-mode">
  <div class="app">
    <header class="hero">
      <div>
        <div class="eyebrow">Viber Command Runner</div>
        <h1 data-i18n="panel.title">Command Console</h1>
      </div>
      <div class="hero-actions">
        <button id="btn-stop" class="danger terminal-stop-btn hidden" data-i18n="btn.stopTask">Stop Task</button>
        <button id="btn-clear-terminal" class="ghost" data-i18n="btn.clearLog">Clear Log</button>
        <button id="btn-terminal" class="ghost" data-i18n="btn.externalTerminal">External Terminal</button>
        <button id="btn-sync" class="ghost" data-i18n="btn.syncOss">Sync OSS</button>
        <button id="btn-refresh" class="ghost" data-i18n="btn.refresh">Refresh</button>
        <button id="btn-import-config" class="ghost" data-i18n="btn.importConfig" data-i18n-title="btn.importConfigTitle" title="Import panel configuration from JSON">Import</button>
        <button id="btn-export-config" class="ghost" data-i18n="btn.exportConfig" data-i18n-title="btn.exportConfigTitle" title="Export panel configuration to JSON">Export</button>
        <button id="btn-settings" class="ghost" data-i18n="btn.settings">Settings</button>
      </div>
    </header>

    <section class="meta-grid" id="meta-grid"></section>

    <section id="terminal-sticky" class="terminal-sticky hidden" aria-hidden="true">
      <div class="terminal-sticky-inner panel">
        <div class="panel-head terminal-head">
          <button id="btn-sticky-fold" type="button" class="terminal-fold-toggle" aria-expanded="true">
            <span class="terminal-fold-chevron" aria-hidden="true"></span>
            <span class="terminal-fold-title" data-i18n="terminal.runLog">Run Log</span>
            <span id="terminal-sticky-preview" class="terminal-fold-preview"></span>
          </button>
          <div class="terminal-sticky-actions">
            <span id="terminal-sticky-status" class="terminal-status running" data-i18n="terminal.running">Running...</span>
            <button id="btn-sticky-stop" class="danger terminal-stop-btn hidden" type="button" data-i18n="btn.abort">Abort</button>
            <button id="btn-sticky-hide" class="ghost" type="button" data-i18n="btn.hide">Hide</button>
          </div>
        </div>
        <div class="terminal-sticky-body">
          <pre id="terminal-sticky-output" class="terminal-output terminal-sticky-output"></pre>
        </div>
      </div>
    </section>

    <div class="content-grid">
      <section class="panel commands-panel">
        <div class="panel-head commands-panel-head">
          <h2 data-i18n="commands.title">Commands</h2>
          <label class="parallel-toggle" data-i18n-title="parallelMode.title" title="Run multiple commands in parallel with per-command terminals">
            <span class="parallel-toggle-label" data-i18n="parallelMode.label">Parallel</span>
            <input id="parallel-mode-toggle" class="parallel-switch-input" type="checkbox" role="switch" />
            <span class="parallel-switch-slider" aria-hidden="true"></span>
          </label>
          <input id="command-filter" type="search" data-i18n-placeholder="commands.filterPlaceholder" placeholder="Filter Android / iOS / Shorebird..." />
        </div>
        <div class="adhoc-runner panel">
          <div class="adhoc-head" data-i18n="adhoc.title">Instant Command</div>
          <div class="adhoc-row">
            <input id="adhoc-command" type="text" data-i18n-placeholder="adhoc.placeholder" placeholder="bash scripts/..." spellcheck="false" data-i18n-title="adhoc.inputTitle" title="Enter a shell command to run immediately" />
            <button id="adhoc-paste" type="button" class="ghost" data-i18n="btn.paste" data-i18n-title="adhoc.pasteTitle" title="Paste from clipboard">Paste</button>
            <button id="adhoc-run" type="button" data-i18n="btn.execute" data-i18n-title="adhoc.runTitle" title="Run command">Execute</button>
          </div>
          <div id="adhoc-task-terminals" class="command-task-terminals"></div>
        </div>
        <div id="command-groups-scroll" class="command-groups-scroll">
          <div id="command-groups" class="command-groups"></div>
        </div>
      </section>

      <section class="panel history-panel">
        <div class="panel-head">
          <h2 data-i18n="history.title">Release History</h2>
        </div>
        <div id="history-latest" class="history-latest"></div>
        <details id="history-archive" class="history-archive">
          <summary class="history-archive-toggle">
            <span data-i18n="history.archive">History</span>
            <span id="history-archive-count" class="history-archive-count"></span>
          </summary>
          <div id="history-archive-scroll" class="history-archive-scroll">
            <div id="history-archive-list" class="history-list"></div>
            <div id="history-archive-footer" class="history-archive-footer"></div>
          </div>
        </details>
      </section>
    </div>

    <section id="terminal-panel" class="panel terminal-panel">
      <div class="panel-head terminal-head">
        <button id="btn-terminal-panel-fold" type="button" class="terminal-fold-toggle" aria-expanded="true">
          <span class="terminal-fold-chevron" aria-hidden="true"></span>
          <span class="terminal-fold-title" data-i18n="terminal.title">Release Terminal</span>
          <span id="terminal-panel-preview" class="terminal-fold-preview"></span>
        </button>
        <div class="terminal-panel-actions">
          <button id="btn-sticky-show" class="ghost hidden" type="button" data-i18n="btn.showFloatingTerminal">Show Floating Terminal</button>
          <button id="btn-terminal-stop" class="danger terminal-stop-btn hidden" type="button" data-i18n="btn.abort">Abort</button>
          <span id="terminal-status" class="terminal-status" data-i18n="terminal.ready">Ready</span>
        </div>
      </div>
      <div class="terminal-panel-body">
        <pre id="terminal-output" class="terminal-output"></pre>
      </div>
    </section>
  </div>

  <div id="input-overlay" class="input-overlay hidden" aria-hidden="true">
    <div class="input-dialog" role="dialog" aria-modal="true" aria-labelledby="input-dialog-title">
      <div class="input-dialog-head">
        <h3 id="input-dialog-title" data-i18n="input.title">Input Required</h3>
        <button id="input-close" class="ghost input-close" type="button" data-i18n-aria="input.close" aria-label="Close">×</button>
      </div>
      <div class="input-context-block">
        <div class="input-section-label" data-i18n="input.context">Terminal Context</div>
        <pre id="input-context-text" class="input-context-text"></pre>
      </div>
      <div class="input-prompt-block">
        <div class="input-section-label" data-i18n="input.prompt">Current Prompt</div>
        <pre id="input-prompt-text" class="input-prompt-text"></pre>
      </div>
      <input id="input-field" class="input-field" type="text" data-i18n-placeholder="input.placeholder" placeholder="Type and press Enter to confirm" />
      <div id="input-shortcuts" class="input-shortcuts"></div>
      <div class="input-actions">
        <button id="input-submit" type="button" data-i18n="btn.confirm">Confirm</button>
        <button id="input-cancel" class="ghost" type="button" data-i18n="btn.cancel">Cancel</button>
      </div>
    </div>
  </div>

  <div id="confirm-overlay" class="input-overlay hidden" aria-hidden="true">
    <div class="input-dialog confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <div class="input-dialog-head">
        <h3 id="confirm-dialog-title" data-i18n="confirm.title">Confirm</h3>
      </div>
      <p id="confirm-message" class="confirm-message"></p>
      <div class="input-actions">
        <button id="confirm-ok" type="button" data-i18n="btn.confirm">Confirm</button>
        <button id="confirm-cancel" class="ghost" type="button" data-i18n="btn.cancel">Cancel</button>
      </div>
    </div>
  </div>

  <div id="app-toast" class="app-toast hidden" role="status" aria-live="off"></div>

  <div id="global-loading" class="global-loading hidden" aria-live="polite" aria-busy="false">
    <div class="global-loading-card">
      <span class="global-loading-spinner" aria-hidden="true"></span>
      <span id="global-loading-text" data-i18n="loading.initial">Loading command console...</span>
    </div>
  </div>

  <script nonce="${nonce}">
    window.__VIBER_I18N__ = ${i18nBootstrap};
  </script>
  <script nonce="${nonce}" src="${i18nUri}"></script>
  <script nonce="${nonce}">
    window.ViberI18n.initI18n(window.__VIBER_I18N__.locale, window.__VIBER_I18N__.catalog);
    window.ViberI18n.applyStaticI18n(document);
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
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
