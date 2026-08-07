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
    this.controller.onTerminalOutput = (chunk, stream) => {
      postExtensionMessage(this.panel.webview, { type: 'terminalOutput', chunk, stream });
    };
    this.controller.onTerminalStarted = (label) => {
      postExtensionMessage(this.panel.webview, { type: 'runStarted', recordId: '', label });
    };
    this.controller.onInteractivePrompt = (prompt, context, shortcuts) => {
      postExtensionMessage(this.panel.webview, { type: 'interactivePrompt', prompt, context, shortcuts });
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

    void this.controller.bootstrap(true).then((state) => {
      postExtensionMessage(this.panel.webview, { type: 'state', payload: state });
    });
  }

  public static createOrShow(extensionUri: vscode.Uri, secrets: vscode.SecretStorage): void {
    if (ReleaseWindowPanel.currentPanel) {
      ReleaseWindowPanel.currentPanel.panel.reveal(vscode.ViewColumn.Active, false);
      void ReleaseWindowPanel.currentPanel.controller.bootstrap(true).then((state) => {
        postExtensionMessage(ReleaseWindowPanel.currentPanel!.panel.webview, { type: 'state', payload: state });
      });
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
      case 'refresh': {
        const state = await this.controller.bootstrap(true);
        postExtensionMessage(this.panel.webview, { type: 'state', payload: state });
        break;
      }
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
      case 'removeCustomCommand': {
        void this.controller.removeCustomCommand(message.customId);
        break;
      }
      case 'setGroupFold': {
        void this.controller.setGroupFold(message.groupId, message.open);
        break;
      }
      case 'syncOss': {
        const state = await this.controller.syncOss(true);
        postExtensionMessage(this.panel.webview, { type: 'state', payload: state });
        break;
      }
      case 'openSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', 'viberCommandRunner');
        break;
      case 'openTerminal':
        this.controller.openTerminal();
        break;
      case 'clearTerminal':
        postExtensionMessage(this.panel.webview, { type: 'terminalClear' });
        break;
      case 'cancelRun': {
        void this.controller.cancelRun();
        break;
      }
      case 'terminalInput': {
        this.controller.submitTerminalInput(message.value);
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
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
        <button id="btn-settings" class="ghost" data-i18n="btn.settings">Settings</button>
      </div>
    </header>

    <section class="meta-grid" id="meta-grid"></section>

    <section id="terminal-sticky" class="terminal-sticky hidden" aria-hidden="true">
      <div class="terminal-sticky-inner panel">
        <div class="panel-head">
          <h2 data-i18n="terminal.runLog">Run Log</h2>
          <div class="terminal-sticky-actions">
            <span id="terminal-sticky-status" class="terminal-status running" data-i18n="terminal.running">Running...</span>
            <button id="btn-sticky-stop" class="danger terminal-stop-btn hidden" type="button" data-i18n="btn.abort">Abort</button>
            <button id="btn-sticky-hide" class="ghost" type="button" data-i18n="btn.hide">Hide</button>
          </div>
        </div>
        <pre id="terminal-sticky-output" class="terminal-output terminal-sticky-output"></pre>
      </div>
    </section>

    <div class="content-grid">
      <section class="panel commands-panel">
        <div class="panel-head">
          <h2 data-i18n="commands.title">Commands</h2>
          <input id="command-filter" type="search" data-i18n-placeholder="commands.filterPlaceholder" placeholder="Filter Android / iOS / Shorebird..." />
        </div>
        <div class="adhoc-runner panel">
          <div class="adhoc-head" data-i18n="adhoc.title">Ad-hoc Command</div>
          <div class="adhoc-row">
            <input id="adhoc-command" type="text" data-i18n-placeholder="adhoc.placeholder" placeholder="bash scripts/..." spellcheck="false" data-i18n-title="adhoc.inputTitle" title="Enter a shell command to run immediately" />
            <button id="adhoc-paste" type="button" class="ghost" data-i18n="btn.paste" data-i18n-title="adhoc.pasteTitle" title="Paste from clipboard">Paste</button>
            <button id="adhoc-run" type="button" data-i18n="btn.execute" data-i18n-title="adhoc.runTitle" title="Run command">Execute</button>
          </div>
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

    <section class="panel terminal-panel">
      <div class="panel-head">
        <h2 data-i18n="terminal.title">Release Terminal</h2>
        <div class="terminal-panel-actions">
          <button id="btn-sticky-show" class="ghost hidden" type="button" data-i18n="btn.showFloatingTerminal">Show Floating Terminal</button>
          <button id="btn-terminal-stop" class="danger terminal-stop-btn hidden" type="button" data-i18n="btn.abort">Abort</button>
          <span id="terminal-status" class="terminal-status" data-i18n="terminal.ready">Ready</span>
        </div>
      </div>
      <pre id="terminal-output" class="terminal-output"></pre>
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
