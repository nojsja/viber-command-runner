# Viber Command Runner

VS Code / Cursor 扩展：在侧边栏统一管理 workspace 构建与脚本命令。

## 功能

- 读取 workspace 的 `command-runner.commands`
- 以**编辑器大窗口**打开命令面板（非窄侧边栏）
- 命令面板：`Viber Command Runner: 打开命令面板`
- 本地执行记录：时间、分支、平台、操作人、版本号
- 可选 OSS 同步：打开面板时拉取 + 执行完成后上传
- 自定义命令、即时命令、内置终端与交互式输入

## 开发

```bash
cd tools/viber-command-runner
npm install
npm run compile
```

在 VS Code / Cursor 中按 `F5` 启动 **Extension Development Host**，打开本项目工作区，点击左侧 **Command Runner** 图标。

## 打包 VSIX

```bash
cd tools/viber-command-runner
npm run package
# 或
bash scripts/package-vsix.sh
```

安装：

```bash
code --install-extension viber-command-runner-0.1.0.vsix
# 或
cursor --install-extension viber-command-runner-0.1.0.vsix
```

## 配置示例

```json
{
  "viberCommandRunner.oss.enabled": true,
  "viberCommandRunner.oss.region": "oss-cn-beijing",
  "viberCommandRunner.oss.bucket": "your-bucket",
  "viberCommandRunner.oss.objectKey": "viber/devtools/command-runner/history/global.json"
}
```

操作人（可选）：

```json
{
  "viberCommandRunner.operator": "Johnson"
}
```

## 本地数据

执行记录保存在用户目录（按工作区区分），不会写入工程仓库：

```
~/.viber/command-runner/workspaces/<workspace-name-hash>/
  history.json
  custom-commands.json
  ui-state.json
```

首次启动时会自动从工程内旧目录（`.goocean/release-panel` / `.viber/command-runner`）迁移数据。
