# Viber Command Runner

VS Code / Cursor extension for running workspace build and script commands from a dedicated command panel.

## Features

- Read commands from `command-runner.commands` or `viberCommandRunner.commands`
- Open the **command panel** in a full editor tab (not a narrow sidebar)
- Command: `Viber Command Runner: Open Command Panel`
- Local run history: time, branch, platform, operator, version
- Optional OSS sync: pull on panel open, push after each run
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
  "viberCommandRunner.uiLanguage": "en",
  "viberCommandRunner.oss.enabled": true,
  "viberCommandRunner.oss.region": "oss-cn-beijing",
  "viberCommandRunner.oss.bucket": "your-bucket",
  "viberCommandRunner.oss.objectKey": "viber/devtools/command-runner/history/global.json"
}
```

Operator (optional):

```json
{
  "viberCommandRunner.operator": "Johnson"
}
```

## Local data

Run records are stored under the user home directory (per workspace), not in the repo:

```
~/.viber/command-runner/workspaces/<workspace-name-hash>/
  history.json
  custom-commands.json
  ui-state.json
```

Legacy data under `.goocean/release-panel` or `.viber/command-runner` in the workspace is migrated on first launch.
