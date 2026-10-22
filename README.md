# dsh-subagent-toolkit · 子代理工具箱

[![version](https://img.shields.io/badge/version-0.0.6-4d93f8)](https://github.com/Kadima-code/dsh-subagent-toolkit/releases) [![npm](https://img.shields.io/npm/v/dsh-subagent-toolkit?color=cb3837&label=npm)](https://www.npmjs.com/package/dsh-subagent-toolkit) [![npm downloads](https://img.shields.io/npm/dm/dsh-subagent-toolkit?color=cb3837&label=npm%20downloads)](https://www.npmjs.com/package/dsh-subagent-toolkit) [![downloads](https://img.shields.io/github/downloads/Kadima-code/dsh-subagent-toolkit/total?color=2f6feb&label=release%20downloads)](https://github.com/Kadima-code/dsh-subagent-toolkit/releases) [![license](https://img.shields.io/badge/license-BSD--3--Clause-8b5cf6)](https://github.com/Kadima-code/dsh-subagent-toolkit/blob/master/LICENSE) [![dsh](https://img.shields.io/badge/DSH-0.2.x-2f6feb)](https://github.com/deepseek-ai/deepseek-harness)

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的**子代理工具箱**，三件事一起做：

1. **分组折叠**：把官方「子代理」下拉按使用批次收进 **本次 / 上次 / 今日 / 历史** 四组；
2. **删除子代理**：行内删单个、组标题删整组，删完计数同步；
3. **模型同步**：委派时可以**逐任务指定模型**，按你当前的子代理模型白名单实时校验。

**不改原版头部、不新增入口**——按钮、布局、原版悬停全部保持原样，插件只在原生下拉和委派链路上做增强。

## 一、分组折叠

按「使用批次」聚合（间隔 ≤ **120 秒**算同一批）：

| 分组 | 含义 | 默认 |
|---|---|---|
| **本次** | 最近一次使用子代理产生的那一批 | 始终展开（带「本次 N」标签） |
| **上次** | 上一次使用子代理产生的那一批 | 折叠 |
| **今日** | 今天其余批次 | 折叠 |
| **历史** | 今天之前 | 折叠 |

- 点分组标题即展开/收起；标题只显示「名称 + 条数」。
- 打开某个**子代理会话**时，它头部的上级/目录下拉也按同一规则分组。
- 数据未就绪或行序对不上时**一律不折叠**（fail-open），绝不误藏运行中的行。

## 二、删除子代理

- **行内**：每行尾部「⋯」→「删除子智能体」，二次确认（运行中会先停止）。
- **整组**：组标题右侧「⋯」→「删除本组（N 个）」，一次删一组，交互与行内一致。
- 删除后该行隐藏，顶部「N 个子智能体」计数**立即同步**（事件驱动，无轮询）。
- 安全性：只允许删除 `origin=subagent` 的会话；校验会话目录在 sessions 根内、拒绝符号链接、删后确认目录消失；运行中默认拒绝、确认后才停止。
- 说明：会话**文件是真删**、不可恢复；父会话目录记录是官方 append-only 事件日志，无法删除，故被删行只在**本机**隐藏（换机器/清缓存可能重现）。

## 三、子代理模型同步

DSH 旧会话的「子代理模型白名单」在会话创建时就冻结了。本插件让**每次委派**都按当前设置校验：

- `subagent` 显式传 `provider` / `model` / `reasoning_effort` → 按**当前设置白名单**校验后生效，主对话可以**每个任务换不同模型**；
- 白名单/模型目录是**运行时读取**：在设置里增删模型**无需重启**；
- 非法路由明确报错（fail-closed），不会静默退回父模型；
- 实现方式：只包 `subagent` 的执行体（摘出显式参数经 AsyncLocalStorage 传给启动层）和 `subagents.startActivation`，**不改任何工具注册**；
- 一键关闭：插件目录建空文件 `.model-sync-off`（或环境变量 `DSF_MODEL_SYNC_OFF=1`），重启后只禁用模型同步，其余功能照常。

## 截图

| 之前 | 之后 |
|---|---|
| ![before](docs/before.png) | ![after](docs/after.png) |

## 安装

**方式一：npm（推荐）**

```bash
npm i dsh-subagent-toolkit
```

然后把 `dsh-subagent-toolkit` 写进 profile 的 `dependencies` 与 `dsh.profile.bundles`（插件自带 `cordis.patch.yml`），**完全退出 DSH 再打开**。

**方式二：一键脚本**（仓库/发布包内 `tools/install.cjs`）

```bash
node tools/install.cjs --profile desktop
```

支持 `--dry-run` 预览、`--uninstall` 卸载，并会备份 profile 的 `package.json`。

**方式三：Release zip** —— 下载 `dsh-subagent-toolkit-v0.0.6.zip`，解压后按方式二安装。

> 改的是 host 半，安装/更新后必须**完全退出 DSH（托盘退出）再打开**，仅 Ctrl+R 不够。

## 兼容与限制

- 目标：DSH **0.2.1-rc.x**（desktop profile）。
- 模型同步属对内核委派链路的适配，DSH 升级后需回归一次；卸载即恢复原生行为。
- 分组/按钮是往 React 托管的原生下拉里注入节点（隐身增强），官方大改版可能需适配。
- 被删会话的“幽灵行”只在**本机**隐藏（见上文删除说明）。

---

# dsh-subagent-toolkit (English)

A **subagent toolkit** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). Three things in one plugin:

1. **Grouped folding** — the native "Subagent" dropdown is grouped by usage batch into **Current / Previous / Today / History**;
2. **Deletion** — delete one subagent from its row, or a whole group from the group header, with the count kept in sync;
3. **Model sync** — pick a model **per delegation**, validated against your current subagent model allowlist.

The original header, layout and native hover behaviour are untouched.

## Features

- **Folding**: batches are derived from subagent creation time (≤120s = one batch). "Current" is always expanded and labelled; the others collapse on click. Works inside a subagent session's own header dropdown too. If the DOM order cannot be matched, nothing is folded (fail-open) — running rows are never hidden by mistake.
- **Deletion**: row-level `⋯ → Delete subagent`, and group-level `⋯ → Delete group (N)`; running sessions are stopped first after confirmation. Only `origin=subagent` sessions can be deleted; the session directory must live under the sessions root, symlinks are refused, and deletion is verified afterwards. Session files are really removed (irreversible). Because the parent's catalog is an append-only event log, the deleted row is hidden **locally** only.
- **Model sync**: an explicit `provider`/`model`/`reasoning_effort` on `subagent` is validated against the **current** allowlist in settings, so the main agent can use a different model for every task. Settings are read at runtime — adding/removing models needs no restart. Invalid routes fail closed with a clear error. Only the `subagent` executor and `subagents.startActivation` are wrapped; no tool registration is touched. Kill switch: create an empty `.model-sync-off` file in the plugin directory (or set `DSF_MODEL_SYNC_OFF=1`).

## Install

```bash
npm i dsh-subagent-toolkit
```

Add `dsh-subagent-toolkit` to the profile `dependencies` and `dsh.profile.bundles` (the package ships its own `cordis.patch.yml`), then **fully quit and reopen DSH**.

Or use the bundled installer:

```bash
node tools/install.cjs --profile desktop   # supports --dry-run / --uninstall
```

Or download `dsh-subagent-toolkit-v0.0.6.zip` from Releases and run the installer above.

> The host half changes on install/update, so a full DSH restart is required (Ctrl+R alone is not enough).

## Compatibility & limitations

- Targets DSH **0.2.1-rc.x** (desktop profile).
- Model sync adapts internal delegation plumbing; re-check after a DSH upgrade. Uninstalling restores native behaviour.
- Folding/buttons inject nodes into React-managed dropdowns; a major upstream UI change may need adaptation.
- Deleted rows are hidden locally only (see above).

## License

BSD-3-Clause
