/**
 * 子代理模型同步（对齐 dsh-model-dispatch 的安全做法）。
 *
 * 只做两件事，且都在官方接缝上：
 *  1) 包 `subagent` 工具的执行体：把显式 provider/model/reasoning_effort 从参数里摘掉，
 *     经 AsyncLocalStorage 传给启动层（这样不会触发会话创建时冻结的模型白名单校验）；
 *  2) 包 subagents.startActivation / startContinuable / start：把选择合并进 agentOptions，
 *     并按**当前模型目录**校验（合法放行、非法明确报错）。
 *
 * 明确不做的（上一版崩因）：
 *  - 绝不 monkey-patch `tools.register`；
 *  - 不替换 `list_subagent_models`（rc.2 上无效且无必要，原生已返回全量目录）。
 * 任何异常都在本层吞掉并写 fallback 日志，绝不冒到 preset 校验。
 * 开关：DSF_MODEL_SYNC_OFF=1 或插件目录存在 .model-sync-off 文件 → 整个功能跳过。
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const delegationSelection = new AsyncLocalStorage();
const LOG = () => join(homedir(), ".dsh", "_plugins", "dsh-subagent-fold", ".model-sync.log");
const OFF_FILE = () => join(homedir(), ".dsh", "_plugins", "dsh-subagent-fold", ".model-sync-off");
function mark(line) {
  try {
    const f = LOG();
    try { const st = existsSync(f) ? require("node:fs").statSync(f) : null; if (st && st.size > 1024 * 1024) require("node:fs").writeFileSync(f, ""); } catch (e) {}
    appendFileSync(f, new Date().toISOString() + " " + line + String.fromCharCode(10));
  } catch (e) {}
}
function svc(ctx, n) {
  try { const v = ctx.get(n); if (v !== undefined) return v; } catch (e) {}
  try { return ctx[n]; } catch (e) { return undefined; }
}
function offReason() {
  try { if (process.env.DSF_MODEL_SYNC_OFF === "1") return "env"; } catch (e) {}
  try { if (existsSync(OFF_FILE())) return "file"; } catch (e) {}
  return false;
}
async function assertRoute(ctx, provider, model) {
  // 优先按当前设置里的子代理模型白名单（subagentModelSelection）校验；设置不可读时再退回模型目录
  try {
    const settings = svc(ctx, "subagentModelSelection");
    const current = settings && typeof settings.current === "function" ? settings.current() : undefined;
    if (current && current.enabled === true && Array.isArray(current.allowedModels) && current.allowedModels.length > 0) {
      const ok = current.allowedModels.some((r) => r && r.provider === provider && r.model === model);
      if (!ok) throw new Error("模型路由 " + provider + "/" + model + " 不在当前允许的子代理模型列表");
      return;
    }
  } catch (e) {
    if (e && /不在当前允许的子代理模型列表/.test(String(e.message))) throw e;
    mark("fallback: 读取设置白名单失败，改用模型目录 " + String(e && e.message));
  }
  const llm = svc(ctx, "llm");
  if (!llm || typeof llm.listProviders !== "function" || typeof llm.listModels !== "function") {
    mark("reject: llm 不可用，无法校验模型路由");
    throw new Error("无法校验模型路由（llm 服务不可用）");
  }
  const providers = llm.listProviders() || [];
  if (!providers.some((p) => p && p.id === provider)) {
    throw new Error("模型路由 " + provider + "/" + model + " 不在当前模型目录");
  }
  const models = await llm.listModels(provider);
  if (!Array.isArray(models) || !models.some((m) => (typeof m === "string" ? m : (m && m.id)) === model)) {
    throw new Error("模型路由 " + provider + "/" + model + " 不在当前模型目录");
  }
}

export function installModelSync(ctx) {
  const off = offReason();
  if (off) { mark("disabled by " + off); return; }

  // 1) 工具执行体：只包 subagent
  try {
    if (typeof ctx.inject === "function") {
      ctx.inject(["tools"], (scope) => {
        const restorations = new WeakMap();
        const definitions = new Set();
        const adapt = (definition) => {
          for (const ref of definitions) { try { if (!ref.deref()) definitions.delete(ref); } catch (e) {} }
          if (!definition || definition.name !== "subagent" || restorations.has(definition)) return;
          const original = definition.execute;
          const wrapped = async (args, exec) => {
            const request = (args && typeof args === "object") ? args : {};
            const provider = request.provider;
            const model = request.model;
            const effort = request.reasoning_effort;
            if (provider === undefined && model === undefined && effort === undefined) {
              return original.call(definition, args, exec);
            }
            let store = null;
            let nativeArgs = null;
            try {
              if (!exec || !exec.agent) throw new Error("子代理模型选择需要父 agent");
              if ((provider === undefined) !== (model === undefined)) throw new Error("provider 与 model 必须同时提供");
              for (const v of [provider, model, effort]) {
                if (v !== undefined && (typeof v !== "string" || v.length === 0)) throw new Error("子代理模型参数必须是非空字符串");
              }
              nativeArgs = Object.assign({}, request);
              delete nativeArgs.provider;
              delete nativeArgs.model;
              delete nativeArgs.reasoning_effort;
              store = { parent: exec.agent };
              if (provider !== undefined) { store.provider = provider; store.model = model; }
              if (effort !== undefined) store.reasoningEffort = effort;
            } catch (e) {
              mark("reject: 参数预处理失败 " + String(e && e.message));
              throw e;
            }
            return delegationSelection.run(store, () => original.call(definition, nativeArgs, exec));
          };
          definition.execute = wrapped;
          restorations.set(definition, { original: original, wrapped: wrapped });
          definitions.add(new WeakRef(definition));
          mark("adapted: subagent");
        };
        scope.on("system-prompt/assemble", async (_assembly, context, next) => {
          try {
            if (context && context.agent) adapt(scope.tools.get("subagent", context.agent));
          } catch (e) {
            mark("fallback: assemble 适配异常 " + String(e && e.message));
          }
          return next();
        }, { prepend: true });
        scope.effect(() => () => {
          for (const ref of definitions) {
            const definition = ref.deref();
            const saved = definition && restorations.get(definition);
            if (definition && saved && definition.execute === saved.wrapped) definition.execute = saved.original;
          }
          definitions.clear();
        }, "dsh-subagent-fold: model-sync-tool");
      });
    }
  } catch (e) {
    mark("fallback: tools 安装失败 " + String(e && e.message));
  }

  // 2) 启动层：合并选择 + 校验
  const runtime = svc(ctx, "subagents");
  if (!runtime) { mark("skip: 无 subagents 服务"); return; }
  try {
    ctx.effect(() => {
      const restorations = [];
      const optionsFor = async (request) => {
        try {
          const explicit = delegationSelection.getStore();
          if (!explicit || !request || explicit.parent !== request.parent) { if (explicit && request) mark("skip: parent mismatch"); return request; }
          const options = Object.assign({}, request.agentOptions || {});
          if (explicit.provider !== undefined) {
            options.provider = explicit.provider;
            options.model = explicit.model;
            delete options.reasoningEffort;
          }
          if (explicit.reasoningEffort !== undefined) options.reasoningEffort = explicit.reasoningEffort;
          if (options.provider !== undefined && options.model !== undefined) {
            await assertRoute(ctx, options.provider, options.model);
            mark("validate ok: " + options.provider + "/" + options.model);
          }
          return Object.assign({}, request, { agentOptions: options });
        } catch (e) {
          if (e && /(不在当前(模型目录|允许的子代理模型列表)|无法校验模型路由)/.test(String(e.message))) { mark("validate reject: " + e.message); throw e; }
          mark("fallback: 启动层异常已吞掉 " + String(e && e.message));
          return request;
        }
      };
      for (const key of ["startActivation", "startContinuable"]) {
        const original = runtime[key];
        if (typeof original !== "function") continue;
        const wrapped = async (spec) => original.call(runtime, Object.assign({}, spec, { request: await optionsFor(spec.request) }));
        runtime[key] = wrapped;
        restorations.push(() => { try { if (runtime[key] === wrapped) runtime[key] = original; } catch (e) {} });
      }
      const start = runtime.start;
      if (typeof start === "function") {
        const wrapped = async (name, request) => start.call(runtime, name, await optionsFor(request));
        runtime.start = wrapped;
        restorations.push(() => { try { if (runtime.start === wrapped) runtime.start = start; } catch (e) {} });
      }
      mark("installed: hooks=" + restorations.length);
      return () => { for (const restore of restorations.reverse()) restore(); };
    }, "dsh-subagent-fold: model-routing");
  } catch (e) {
    mark("fallback: 启动层安装失败 " + String(e && e.message));
  }
}
