import { AsyncLocalStorage } from "node:async_hooks";

const delegationSelection = new AsyncLocalStorage();

function svc(ctx, n) {
  try { const v = ctx.get(n); if (v !== undefined) return v; } catch (e) {}
  try { return ctx[n]; } catch (e) { return undefined; }
}
function catalogOf(ctx) {
  const llm = svc(ctx, "llm");
  if (!llm || typeof llm.listProviders !== "function" || typeof llm.listModels !== "function") {
    throw new Error("模型目录不可用（llm 服务缺失）");
  }
  return llm;
}
async function assertCatalogRoute(ctx, selection) {
  const llm = catalogOf(ctx);
  const providers = llm.listProviders() || [];
  if (!providers.some((p) => p && p.id === selection.provider)) {
    throw new Error("模型路由 " + selection.provider + "/" + selection.model + " 不在当前模型目录");
  }
  const models = await llm.listModels(selection.provider);
  if (!Array.isArray(models) || !models.some((m) => m && m.id === selection.model)) {
    throw new Error("模型路由 " + selection.provider + "/" + selection.model + " 不在当前模型目录");
  }
}
async function listCatalogModels(ctx, args, signal) {
  const request = (args && typeof args === "object") ? args : {};
  const llm = catalogOf(ctx);
  const providers = llm.listProviders() || [];
  if (request.model !== undefined && request.provider === undefined) throw new Error("model 必须同时提供 provider");
  if (request.provider === undefined) {
    return providers.map((p) => p.id + " — " + p.name).join("\n") || "(无模型供应商)";
  }
  if (!providers.some((p) => p && p.id === request.provider)) throw new Error("未知模型供应商: " + request.provider);
  const models = await llm.listModels(request.provider);
  if (signal && typeof signal.throwIfAborted === "function") signal.throwIfAborted();
  if (request.model === undefined) {
    return (models || []).map((m) => request.provider + "/" + m.id + " — " + m.name).join("\n") || "(无模型)";
  }
  await assertCatalogRoute(ctx, { provider: request.provider, model: request.model });
  const info = typeof llm.resolveModelInfo === "function"
    ? await llm.resolveModelInfo(request.provider, request.model, signal)
    : { id: request.model, name: request.model };
  if (signal && typeof signal.throwIfAborted === "function") signal.throwIfAborted();
  return request.provider + "/" + info.id + " — " + info.name;
}

export function installModelSync(ctx) {

  try {
    if (typeof ctx.inject === "function") {
      ctx.inject(["tools"], (scope) => {
        const restorations = new WeakMap();
        const definitions = new Set();
        const adapt = (definition) => {
          if (!definition || restorations.has(definition)) return;
          const original = definition.execute;
          const wrapped = definition.name === "list_subagent_models"
            ? (args, exec) => listCatalogModels(ctx, args, exec && exec.signal)
            : async (args, exec) => {
                const request = (args && typeof args === "object") ? args : {};
                const provider = request.provider;
                const model = request.model;
                const effort = request.reasoning_effort;
                const nativeArgs = Object.assign({}, request);
                delete nativeArgs.provider;
                delete nativeArgs.model;
                delete nativeArgs.reasoning_effort;
                if (provider === undefined && model === undefined && effort === undefined) {
                  return original.call(definition, args, exec);
                }
                if (!exec || !exec.agent) throw new Error("子代理模型选择需要父 agent");
                if ((provider === undefined) !== (model === undefined)) throw new Error("provider 与 model 必须同时提供");
                for (const v of [provider, model, effort]) {
                  if (v !== undefined && (typeof v !== "string" || v.length === 0)) throw new Error("子代理模型参数必须是非空字符串");
                }
                if (exec.signal && typeof exec.signal.throwIfAborted === "function") exec.signal.throwIfAborted();
                const store = { parent: exec.agent };
                if (provider !== undefined) { store.provider = provider; store.model = model; }
                if (effort !== undefined) store.reasoningEffort = effort;
                return delegationSelection.run(store, () => original.call(definition, nativeArgs, exec));
              };
          definition.execute = wrapped;
          restorations.set(definition, { original: original, wrapped: wrapped });
          definitions.add(new WeakRef(definition));
        };
        scope.on("system-prompt/assemble", async (_assembly, context, next) => {
          if (context && context.agent) {
            try { adapt(scope.tools.get("subagent", context.agent)); } catch (e) {}
            try { adapt(scope.tools.get("list_subagent_models", context.agent)); } catch (e) {}
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
        }, "dsh-subagent-fold: model-sync");
      });
    }
  } catch (e) {
    if (ctx.logger && ctx.logger.warn) ctx.logger.warn("subagent-fold: 模型同步(tools)安装失败 " + String(e));
  }

  const runtime = svc(ctx, "subagents");
  if (!runtime) return;
  ctx.effect(() => {
    const restorations = [];
    const optionsFor = async (request) => {
      const explicit = delegationSelection.getStore();
      if (!explicit || explicit.parent !== request.parent) return request;
      const options = Object.assign({}, request.agentOptions || {});
      if (explicit.provider !== undefined) {
        options.provider = explicit.provider;
        options.model = explicit.model;
        delete options.reasoningEffort;
      }
      if (explicit.reasoningEffort !== undefined) options.reasoningEffort = explicit.reasoningEffort;
      if (options.provider !== undefined && options.model !== undefined) {
        await assertCatalogRoute(ctx, { provider: options.provider, model: options.model });
      }
      return Object.assign({}, request, { agentOptions: options });
    };
    for (const key of ["startActivation", "startContinuable"]) {
      const original = runtime[key];
      if (typeof original !== "function") continue;
      const wrapped = async (spec) => original.call(runtime, Object.assign({}, spec, { request: await optionsFor(spec.request) }));
      runtime[key] = wrapped;
      restorations.push(() => { if (runtime[key] === wrapped) runtime[key] = original; });
    }
    const start = runtime.start;
    if (typeof start === "function") {
      const wrapped = async (name, request) => start.call(runtime, name, await optionsFor(request));
      runtime.start = wrapped;
      restorations.push(() => { if (runtime.start === wrapped) runtime.start = start; });
    }
    return () => { for (const restore of restorations.reverse()) restore(); };
  }, "dsh-subagent-fold: model-routing");
}
