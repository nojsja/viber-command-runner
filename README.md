# Viber Command Runner

VS Code / Cursor extension for running workspace build and script commands from a dedicated command panel.

## Features

- Read commands from `command-runner.commands` or `viberCommandRunner.commands`
- Open the **command panel** in a full editor tab (not a narrow sidebar)
- Command: `Viber Command Runner: Open Command Panel`
- Local run history: time, branch, platform, operator, version
- Pluggable remote sync for run history (pull on panel open, push after each run)
- Custom commands, instant commands, embedded terminal, and interactive prompts
- Parallel mode with per-command terminals

## Development

```bash
npm install
cd webview && npm install && cd ..
npm run compile
```

Press `F5` in VS Code / Cursor to launch the **Extension Development Host**, open a workspace, and click the **Command Runner** activity bar icon.

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
code --install-extension viber-command-runner-0.1.0.vsix
# or
cursor --install-extension viber-command-runner-0.1.0.vsix
```

## Configuration

```json
{
  "viberCommandRunner.uiLanguage": "en"
}
```

Operator (optional):

```json
{
  "viberCommandRunner.operator": "Johnson"
}
```

## Remote sync API

Other extensions can register a remote storage provider for run history sync:

```typescript
const runner = vscode.extensions.getExtension('nojsja.viber-command-runner');
const api = await runner?.activate();

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
~/.viber/command-runner/workspaces/<workspace-name-hash>/
  history.json
  custom-commands.json
  ui-state.json
```

Legacy data under `.goocean/release-panel` or `.viber/command-runner` in the workspace is migrated on first launch.
