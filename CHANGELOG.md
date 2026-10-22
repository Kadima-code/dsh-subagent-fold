# Changelog

## v0.0.6（改名后首版，含身份修复）

- **修复改名遗漏**：模块导出 name / client 注册 id / 日志路径仍指向旧名，导致 web-boot「entry 未激活」与「duplicate factory registration」。三处身份标识已改为 dsh-subagent-toolkit；内部键（NS / localStorage DEL_KEY / effect 标签）故意保留。
- 新增 test/identity.cjs：自检 package.name / index export name / client id / patch name 四者一致，防再次漏改。

## v1.0.0（全量改名）

- **改名**：`dsh-subagent-fold` → **`dsh-subagent-toolkit`**（子代理工具箱）。因为功能已不止折叠：分组折叠 + 子代理删除（单个/整组）+ 子代理模型实时同步。
- 插件 id / cordis patch id / npm 包名 / GitHub 仓库 全部随之改名；旧 npm 包 `dsh-subagent-fold` 标记 deprecated 并指向新包。
- 功能与本仓库 v0.0.6 一致：按使用批次分组、行内 ⋯ 删除、组标题 ⋯ 整组删除、计数事件驱动、子代理模型同步（显式逐任务选模型 + 白名单实时校验）。
- 会审修复一并包含：删除路由同源校验、rm 前 lstat/删后 stat 确认、索引不可用与找不到会话区分、批量并发删除、异常降级与 kill switch（`.model-sync-off`）。

## v0.0.6

- **子代理模型同步（新）**：新增 host 模块 `lib/model-sync.js`——`list_subagent_models` 改为返回**当前模型目录**（llm 实时查询，无缓存）；`subagent` 的显式 `provider/model` 先从参数剥离、按实时目录校验，再经 `AsyncLocalStorage` 合并进 `startActivation/startContinuable` 的 `agentOptions`。不改工具 schema，无显式选择时原样透传，原生守卫/日志/生命周期不变。
- 效果：旧会话不再受创建时 allowedModels 快照限制，主对话可逐任务选不同模型（实测旧会话 3 个模型均成功建子会话，路由已核对）。
- 风险：属于对内核工具执行体的适配，DSH 升级后需回归；卸载插件即恢复原生行为。

## v0.0.5

- **整组删除**：各分组标题（历史/今日/上次/本次）右侧新增「⋯」→「删除本组（N 个）」，一次删掉整组；交互与行内单个删除完全一致（先弹菜单、再确认）。
- **批量接口**：host `POST /subagent-fold/api/delete` 支持 `sessionIds` 数组（上限 500，逐条校验仅允许 origin=subagent，返回 deleted/failed）。
- **计数即时同步**：总数改事件驱动修正（删除完成即刻 + 100/300ms 兜底 + 展开时校正），不再轮询；组件重渲染也不会回退。
- **幽灵行清理**：父会话 catalog 为 append-only，磁盘已删的旧记录在整组删除时自动静默隐藏，不再虚报"找不到该会话"。
- 修复：会话索引返回包装记录（`{header:{…}}`）导致查不到会话。

## v0.0.4

- **子代理可删除**：子代理行尾部新增「⋯」菜单 →「删除子智能体」，二次确认（运行中会先停止）。host 半自带兜底实现（仅允许删除 `origin=subagent` 的会话，校验目录防穿越；官方无删除 API，装了 dsh-session-manager 时优先复用）。
- **计数同步**：删除后该行隐藏，「N 个子智能体」显示数按已删 id 递减并持久化（localStorage），刷新后仍准确。
- 离线测试：非法 id→400、主会话→403、子代理→200 且目录真删。

## v0.0.3

- 新增 `tools/install.cjs`：一条命令写入 `dependencies` + `dsh.profile.bundles`，并备份 profile 的 `package.json`；支持 `--dry-run` 预览、`--uninstall` 卸载。
- 已在临时 profile 实测：安装（依赖/装配登记/junction）与卸载（回滚干净）均通过。
- 插件功能代码无变化（分组折叠行为同 v0.0.2）。

## v0.0.2

- **子代理界面折叠统一**：打开子代理会话时，其头部下拉（父会话子代理目录 / lineage）也按 历史 / 今日 / 上次 / 本次 分组折叠，与主会话一致。
- 不再干预原版悬停展开：悬停恢复官方行为，点击开/关仍由插件处理。
- 内部：分组数据改为「多套候选按行标签匹配」，同时支持父会话目录与本会话子目录。

## v0.0.1

- 首个发布版：在原生「子代理」下拉里按使用批次分 历史 / 今日 / 上次 / 本次 四组，本次始终展开，其余可折叠。
- 不改原版头部；fail-open；零外部依赖。
