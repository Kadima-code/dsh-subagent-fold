# dsh-subagent-fold

DSH（DeepSeek Harness）客户端插件：**按“使用批次”折叠子代理列表**。
A DSH (DeepSeek Harness) client plugin that **folds the subagent list by usage batch**.

---

## 中文

不修改原版头部，只在官方「子代理」下拉菜单里分组：把不同时间批次产生的子代理分别收进 **历史 / 今日 / 上次 / 本次** 四组。**本次始终展开**，其余可折叠，展开后条目不会与「本次」混在一起。

### 特性
- **四段分组（上 → 下）**：历史 / 今日 / 上次 / 本次
  - **本次**：最近一次使用子代理的那一批（并行发起算同一批），始终展开
  - **上次**：上一批使用子代理产生的（折叠）
  - **今日**：今天其余批次的（折叠）
  - **历史**：今天之前的（折叠）
- **批次判定**：按子代理创建时间聚合，间隔 ≤120 秒视为同一批。
- **不动原版 UI**：只增强官方下拉，不替换按钮、不改头部布局。
- **fail-open**：数据未就绪或行序对不上时**一律不折叠**，绝不误藏正在运行的子代理。
- **低开销**：仅监听菜单浮层；菜单关闭即停止；折叠显隐用 CSS 属性选择器（O(1)）。
- **零外部依赖**：`lib/client.js` 为手写产物，无构建步骤、无网络、无落盘。

### 兼容性
- DSH 桌面版（Electron）0.2.x（实测 0.2.1-rc.2）。
- 纯客户端插件，不依赖 super-injector 等热加载工具；按标准 bundle 安装即可使用全部功能。

### 安装（标准 DSH 插件安装）
1. 把本包放进目标 profile 的 `node_modules`（`pnpm add` / 解压到 `node_modules/@dsh-external/dsh-subagent-fold`）。
2. 在该 profile 的 `package.json` 里登记依赖与 bundle：
   ```json
   {
     "dependencies": { "@dsh-external/dsh-subagent-fold": "link:<本地路径>" },
     "dsh": { "profile": { "bundles": ["@dsh-external/dsh-subagent-fold"] } }
   }
   ```
3. 重启 DSH。

> 说明：DSH 的插件是**按 `dsh.profile.bundles` 显式装配**的，仅放进 `node_modules` 不会自动加载，所以需要登记这两处。通过官方插件市场/`plugin_manager install_bundle` 安装时，它会自动写入这些配置。

### 卸载
从 profile `package.json` 的 `dependencies` 与 `dsh.profile.bundles` 移除本包，删除 `node_modules/@dsh-external/dsh-subagent-fold`，重启。

### 文件结构
```
package.json        # 插件声明（bundle patch + client）
cordis.patch.yml    # 装配补丁：向组合树插入一条插件条目
lib/index.js        # 宿主半（空实现）
lib/client.js       # 客户端半：菜单分组与折叠
```

### 说明
- 本仓库为发布版：仅包含运行所需的功能代码（无测试、无构建脚本、无注释）。
- 不采集任何数据，不发起网络请求。

---

## English

Does not touch the original header. It only enhances the built-in **Subagent** dropdown: subagents are grouped by **usage batch** into **History / Today / Previous / Current**. **Current is always expanded**; the others are collapsible, so an expanded group never gets mixed up with "Current".

### Features
- **Four sections (top → bottom)**: History / Today / Previous / Current
  - **Current**: the most recent batch of subagents (parallel spawns count as one batch); always expanded
  - **Previous**: the batch before that (collapsed)
  - **Today**: other batches from today (collapsed)
  - **History**: anything before today (collapsed)
- **Batch detection**: grouped by subagent creation time; a gap of ≤120 s is treated as the same batch.
- **No UI replacement**: enhances the built-in dropdown only; no button swap, no header layout change.
- **Fail-open**: if data is not ready or row order does not match, **nothing is folded** — a running subagent is never hidden.
- **Low overhead**: observes the menu only; stops when the menu closes; visibility via CSS attribute selectors (O(1)).
- **No external deps**: `lib/client.js` is hand-written; no build step, no network, no disk I/O.

### Compatibility
- DSH desktop (Electron) 0.2.x (tested on 0.2.1-rc.2).
- Pure client plugin; does **not** require hot-reload tools such as super-injector. A standard bundle install provides all features.

### Install (standard DSH plugin install)
1. Put this package into the target profile's `node_modules` (`pnpm add` or extract to `node_modules/@dsh-external/dsh-subagent-fold`).
2. Register it in that profile's `package.json`:
   ```json
   {
     "dependencies": { "@dsh-external/dsh-subagent-fold": "link:<local-path>" },
     "dsh": { "profile": { "bundles": ["@dsh-external/dsh-subagent-fold"] } }
   }
   ```
3. Restart DSH.

> Note: DSH assembles plugins **explicitly from `dsh.profile.bundles`**. Dropping a package into `node_modules` alone is not enough, hence the two entries above. Installing via the official plugin market / `plugin_manager install_bundle` writes these entries for you.

### Uninstall
Remove the package from `dependencies` and `dsh.profile.bundles`, delete `node_modules/@dsh-external/dsh-subagent-fold`, then restart.

### Layout
```
package.json        # plugin manifest (bundle patch + client)
cordis.patch.yml    # assembly patch: inserts one plugin entry into the composition tree
lib/index.js        # host half (no-op)
lib/client.js       # client half: menu grouping & folding
```

### Notes
- This repository is the release build: runtime functional code only (no tests, no build scripts, no comments).
- No telemetry, no network requests.

## License

BSD-3-Clause
