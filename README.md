# dsh-subagent-fold

DeepSeek Harness（DSH）客户端插件：**按“使用批次”折叠子代理列表**。

不修改原版头部，只在官方「子代理」下拉菜单里做分组：把不同时间批次产生的子代理分别收进 **历史 / 今日 / 上次 / 本次** 四组。**本次始终展开**，其余可折叠，展开后条目不会与「本次」混在一起。

## 特性

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

## 兼容性

- DSH 桌面版（Electron）0.2.x 系列（实测 0.2.1-rc.2）。
- 纯客户端插件，不依赖 super-injector 等热加载工具；按标准 bundle 安装即可使用全部功能。

## 安装（标准 DSH 插件安装）

1. 将本包放入目标 profile 的 `node_modules`：
   ```bash
   # 二选一
   pnpm add <本地路径或包名>
   # 或手动解压到 <profile>/node_modules/@dsh-external/dsh-subagent-fold
   ```
2. 编辑该 profile 的 `package.json`，加入依赖与 bundle：
   ```json
   {
     "dependencies": {
       "@dsh-external/dsh-subagent-fold": "link:<本地路径>"
     },
     "dsh": {
       "profile": {
         "bundles": [
           "@dsh-external/dsh-subagent-fold"
         ]
       }
     }
   }
   ```
3. 重启 DSH。宿主会按 `dsh.bundle.patch` 装配，客户端按 `dsh.client` 自动加载。

## 卸载

从 profile `package.json` 的 `dependencies` 与 `dsh.profile.bundles` 中移除本包，并删除 `node_modules/@dsh-external/dsh-subagent-fold`，重启即可。

## 文件结构

```
package.json        # 插件声明（bundle patch + client）
cordis.patch.yml    # 装配补丁：向组合树插入一条插件条目
lib/index.js        # 宿主半（空实现）
lib/client.js       # 客户端半：菜单分组与折叠
```

## 说明

- 本仓库为发布版：仅包含运行所需的功能代码（无测试、无构建脚本、无注释）。
- 不采集任何数据，不发起网络请求。

## License

BSD-3-Clause
