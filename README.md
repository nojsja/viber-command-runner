# Viber Workbench

VS Code / Cursor extension for running workspace build and script commands from a dedicated workbench panel.

## Features

- Read commands from `command-runner.commands` or workbench-managed preset commands
- Open the **workbench** in a full editor tab (not a narrow sidebar)
- Command: `Viber Workbench: Open Workbench`
- Local run history: time, branch, platform, operator, version
- Pluggable remote sync for run history (pull on panel open, push after each run)
- Custom commands, instant commands, embedded terminal, and interactive prompts
- Parallel mode with per-command terminals
- VS Code Marketplace browser with one-click VSIX install for Cursor

## Development

```bash
npm install
cd webview && npm install && cd ..
npm run compile
```

Press `F5` in VS Code / Cursor to launch the **Extension Development Host**, open a workspace, and click the **Workbench** activity bar icon.

```bash
npm run watch          # extension TypeScript
npm run watch:webview  # webview UI
```

## Package VSIX

```bash
npm run package
```

Install:

```bash
code --install-extension viber-workbench-0.3.0.vsix
# or
cursor --install-extension viber-workbench-0.3.0.vsix
```

## Configuration

```json
{
  "viberWorkbench.uiLanguage": "en"
}
```

Operator (optional):

```json
{
  "viberWorkbench.operator": "Johnson"
}
```

Legacy settings under `viberCommandRunner.*` are still read as fallbacks.

## Remote sync API

Other extensions can register a remote storage provider for run history sync:

```typescript
const workbench = vscode.extensions.getExtension('nojsja.viber-workbench');
const api = await workbench?.activate();

api?.registerRemoteSyncProvider({
  id: 'my-storage',
  isEnabled: () => true,
  async pull(context) {
    // return ReleaseHistoryBundle from remote storage
  },
  async push(context, bundle) {
    // upload bundle to remote storage, return ISO timestamp
    return new Date().toISOString();
  },
});
```

When no provider is registered (or `isEnabled()` returns false), sync is a no-op and records stay local only.

## Local data

Run records are stored under the user home directory (per workspace), not in the repo:

```
~/.viber/workbench/workspaces/<workspace-name-hash>/
  history.json
  custom-commands.json
  ui-state.json
```

Legacy data under `~/.viber/command-runner`, `.goocean/release-panel`, or `.viber/command-runner` in the workspace is migrated on first launch.
