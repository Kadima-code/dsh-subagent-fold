
import { rm, readdir, stat, lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { installModelSync } from "./model-sync.js";

export const name = "@dsh-external/dsh-subagent-toolkit";

export const inject = ["webServer", "workspaceRegistry", "sessions", "agents", "sessionPersistence", "subagents"];

const API_PREFIX = "/subagent-fold/api";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,127}$/;
const ARTIFACT_NAMES = ["session.jsonl", "session.jsonl.zstd"];
const MAX_BATCH = 500;

function svc(ctx, n) {
  try { const v = ctx.get(n); if (v !== undefined) return v; } catch (e) {  }
  try { return ctx[n]; } catch (e) { return undefined; }
}
function send(res, code, obj) {
  try { if (res.writableEnded) return; } catch (e) {}
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1 << 20) { const err = new Error("body too large"); err.code = "too-large"; rejectBody(err); try { req.destroy(); } catch (e) {} } });
    req.on("end", () => resolveBody(raw));
    req.on("error", rejectBody);
  });
}
function sessionsRoot(ctx) {
  const served = svc(ctx, "dshHomePath");
  if (typeof served === "function") { try { return resolve(served("sessions")); } catch (e) {} }
  const home = (typeof process.env.DSH_HOME === "string" && process.env.DSH_HOME.trim()) ? process.env.DSH_HOME.trim() : join(homedir(), ".dsh");
  return resolve(join(home, "sessions"));
}
function assertInside(dir, root, sessionId) {
  const d = resolve(dir);
  if (d !== root && !d.startsWith(root + sep)) throw new Error("会话目录不在 sessions 根内，已拒绝");
  if (d.split(sep).pop() !== sessionId) throw new Error("会话目录名与会话 id 不一致，已拒绝");
  return d;
}
async function headerOf(ctx, sessionId, persistence, prefetched) {
  if (Array.isArray(prefetched)) {
    const hit0 = prefetched.find((h) => h && h.id === sessionId);
    if (hit0) return hit0;
  } else if (persistence && typeof persistence.list === "function") {
    try {
      const list = await persistence.list();
      const arr = Array.isArray(list) ? list : [];
      const hit = arr.find((h) => h && (h.id === sessionId || (h.header && h.header.id === sessionId)));
      if (hit) return hit.header || hit;
    } catch (e) {}
  }
  const sessions = svc(ctx, "sessions");
  try { const s = sessions && sessions.get && sessions.get(sessionId); if (s && s.header) return s.header; } catch (e) {}
  return undefined;
}
async function locateDir(persistence, header, root, sessionId) {
  if (persistence && typeof persistence.locate === "function" && header) {
    try {
      const p = persistence.locate(header) && persistence.locate(header).path;
      if (typeof p === "string") return assertInside(dirname(p), root, sessionId);
    } catch (e) {}
  }
  let projects = [];
  try { projects = await readdir(root, { withFileTypes: true }); } catch (e) { return undefined; }
  for (const proj of projects) {
    if (!proj.isDirectory() || proj.isSymbolicLink()) continue;
    const dir = join(root, proj.name, sessionId);
    for (const fn of ARTIFACT_NAMES) {
      try { await stat(join(dir, fn)); return assertInside(dir, root, sessionId); } catch (e) {}
    }
  }
  return undefined;
}

export function apply(ctx) {
  const registry = svc(ctx, "workspaceRegistry");
  const persistence = svc(ctx, "sessionPersistence");
  const sessions = svc(ctx, "sessions");
  const agents = svc(ctx, "agents");

  async function deleteOne(sessionId, stopActivity, prefetched) {
    if (!ID_RE.test(sessionId)) return { sessionId, ok: false, error: "非法会话 id" };
    const header = await headerOf(ctx, sessionId, persistence, prefetched);
    if (!header) {
      if (prefetched === null) return { sessionId, ok: false, code: "unavailable", error: "会话索引暂不可用，未做任何改动" };
      return { sessionId, ok: false, error: "找不到该会话" };
    }
    if (header.origin !== "subagent") return { sessionId, ok: false, error: "只允许删除子智能体会话" };
    if (!agents || typeof agents.get !== "function") {
      return { sessionId, ok: false, code: "unavailable", error: "无法确认会话运行状态（agents 服务不可用），已拒绝删除" };
    }
    let agent;
    try { agent = agents.get(sessionId); } catch (e) { return { sessionId, ok: false, code: "unavailable", error: "读取会话运行状态失败，已拒绝删除" }; }
    const running = !!(agent && (agent.status === "running" || agent.busy === true || agent.status === "pending" || agent.status === "starting"));
    if (running && stopActivity !== true) return { sessionId, ok: false, code: "running", error: "仍在运行中，需先停止" };
    try { if (running && agent && typeof agent.cancel === "function") agent.cancel({ kind: "user" }); } catch (e) {}
    if (running) {
      for (let i = 0; i < 15; i++) {
        let still = false;
        try { const a = agents && agents.get && agents.get(sessionId); still = !!(a && (a.status === "running" || a.busy === true)); } catch (e) { still = false; }
        if (!still) break;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    try {
      if (registry && typeof registry.stopSessionActivity === "function") await registry.stopSessionActivity(sessionId);
      else if (typeof ctx.parallel === "function") await ctx.parallel("workspace/session-stop", { sessionId });
    } catch (e) {}
    let detached = false;
    try {
      const entry = sessions && sessions.store && sessions.store.get && sessions.store.get(sessionId);
      if (entry && typeof entry.detach === "function") { entry.detach(); detached = true; }
    } catch (e) {}
    if (!detached) { try { ctx.emit("session/disposed", { id: sessionId }); } catch (e) {} }
    const root = sessionsRoot(ctx);
    let filesRemoved = false;
    try {
      const dir = await locateDir(persistence, header, root, sessionId);
      if (dir) {
        const st = await lstat(dir);
        if (st.isSymbolicLink()) throw new Error("会话目录是符号链接，已拒绝删除");
        let lastErr;
        for (let attempt = 0; attempt < 4; attempt++) {
          try { await rm(dir, { recursive: true, force: true }); lastErr = null; break; }
          catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 120 * (attempt + 1))); }
        }
        if (lastErr) throw lastErr;
        let still = false;
        try { await stat(dir); still = true; } catch (e) { if (e && e.code !== "ENOENT") throw e; }
        if (still) throw new Error("删除后目录仍存在");
        filesRemoved = true;
      }
    } catch (e) { return { sessionId, ok: false, error: String((e && e.message) || e) }; }
    try { if (registry && typeof registry.unarchiveSession === "function") await registry.unarchiveSession(sessionId); } catch (e) {}
    return { sessionId, ok: true, filesRemoved };
  }

  installModelSync(ctx);

  ctx.effect(() => {
    const webServer = svc(ctx, "webServer");
    if (!webServer || typeof webServer.register !== "function") return;
    let handle;
    try {
      handle = webServer.register({
        kind: "prefix",
        path: API_PREFIX,
        handler: async (req, res) => {
          try {
            try {
              const origin = req.headers && req.headers.origin;
              const site = req.headers && req.headers["sec-fetch-site"];
              if (site && site !== "same-origin" && site !== "same-site") return send(res, 403, { ok: false, error: "forbidden origin" });
              if (origin) {
                const o = new URL(origin);
                if (o.host !== (req.headers.host || "")) return send(res, 403, { ok: false, error: "forbidden origin" });
              }
            } catch (e) {}
            const url = new URL(req.url || "/", "http://localhost");
            const path = url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) || "/" : "/";
            if (req.method !== "POST" || path !== "/delete") return send(res, 404, { ok: false, error: "not found" });
            const raw = await readBody(req);
            let body = {};
            if (raw.trim() !== "") {
              try { body = JSON.parse(raw); } catch (e) { return send(res, 400, { ok: false, error: "请求体不是合法 JSON" }); }
            }
            let ids = Array.isArray(body.sessionIds) ? body.sessionIds : (body.sessionId ? [body.sessionId] : []);
            ids = ids.map((x) => String(x || "").trim()).filter(Boolean);
            if (!ids.length) return send(res, 400, { ok: false, error: "缺少 sessionId / sessionIds" });
            if (ids.length > MAX_BATCH) return send(res, 400, { ok: false, error: "一次最多 " + MAX_BATCH + " 个" });
            const stopActivity = body.stopActivity === true;
            let prefetched;
            try {
              const list = persistence && typeof persistence.list === "function" ? await persistence.list() : null;
              if (Array.isArray(list)) prefetched = list.map((x) => (x && x.header) ? x.header : x);
            } catch (e) { prefetched = null; }
            const deleted = [];
            const failed = [];
            const results = new Array(ids.length);
            let cursor = 0;
            const worker = async () => {
              while (cursor < ids.length) {
                const idx = cursor++;
                const sid = ids[idx];
                try { results[idx] = await deleteOne(sid, stopActivity, prefetched); }
                catch (e) { results[idx] = { sessionId: sid, ok: false, error: String((e && e.message) || e) }; }
              }
            };
            await Promise.all(Array.from({ length: Math.min(8, ids.length) }, worker));
            for (const r of results) { if (r && r.ok) deleted.push(r.sessionId); else failed.push(r || { ok: false, error: "unknown" }); }
            if (ctx.logger && ctx.logger.info) ctx.logger.info(`subagent-fold: deleted ${deleted.length}/${ids.length} subagent sessions`);
            if (ids.length === 1 && failed.length === 1) {
              const f = failed[0] || {};
              return send(res, 200, { ok: false, error: f.error, code: f.code, deleted, failed, total: 1 });
            }
            if (deleted.length === 0 && failed.length > 0) {
              const f = failed[0] || {};
              return send(res, 409, { ok: false, error: f.error || "全部删除失败", code: f.code, deleted, failed, total: ids.length });
            }
            return send(res, 200, { ok: deleted.length > 0, deleted, failed, total: ids.length });
          } catch (err) {
            const code = err && err.code === "too-large" ? 413 : 500;
            return send(res, code, { ok: false, error: String((err && err.message) || err) });
          }
        },
      });
    } catch (e) {
      if (ctx.logger && ctx.logger.warn) ctx.logger.warn("subagent-fold: 删除路由注册失败 " + String(e));
      return;
    }
    return () => {
      try { if (typeof handle === "function") handle(); else if (handle && typeof handle.dispose === "function") handle.dispose(); } catch (e) {}
    };
  }, "dsh-subagent-fold: delete-api");
}
