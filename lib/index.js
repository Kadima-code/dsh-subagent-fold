import { rm, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

export const name = "@dsh-external/dsh-subagent-fold";

export const inject = [
  "webServer",
  "workspaceRegistry",
  "sessions",
  "agents",
  "sessionPersistence",
];

const API_PREFIX = "/subagent-fold/api";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
const ARTIFACT_NAMES = ["session.jsonl", "session.jsonl.zstd"];

function svc(ctx, n) {
  try { const v = ctx.get(n); if (v !== undefined) return v; } catch (e) {  }
  try { return ctx[n]; } catch (e) { return undefined; }
}
function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 65536) { rejectBody(new Error("body too large")); req.destroy(); }
    });
    req.on("end", () => resolveBody(raw));
    req.on("error", rejectBody);
  });
}
function sessionsRoot(ctx) {
  const served = svc(ctx, "dshHomePath");
  if (typeof served === "function") {
    try { return resolve(served("sessions")); } catch (e) {  }
  }
  const home = (typeof process.env.DSH_HOME === "string" && process.env.DSH_HOME.trim())
    ? process.env.DSH_HOME.trim()
    : join(homedir(), ".dsh");
  return resolve(join(home, "sessions"));
}

function assertInside(dir, root, sessionId) {
  const d = resolve(dir);
  if (d !== root && !d.startsWith(root + sep)) throw new Error("会话目录不在 sessions 根内，已拒绝");
  if (d.split(sep).pop() !== sessionId) throw new Error("会话目录名与会话 id 不一致，已拒绝");
  return d;
}
async function headerOf(ctx, sessionId, persistence) {
  if (persistence && typeof persistence.list === "function") {
    try {
      const list = await persistence.list();
      const hit = (Array.isArray(list) ? list : []).find((h) => h && h.id === sessionId);
      if (hit) return hit;
    } catch (e) {  }
  }
  const sessions = svc(ctx, "sessions");
  try {
    const s = sessions && sessions.get && sessions.get(sessionId);
    if (s && s.header) return s.header;
  } catch (e) {  }
  return undefined;
}
async function locateDir(persistence, header, root, sessionId) {
  if (persistence && typeof persistence.locate === "function" && header) {
    try {
      const p = persistence.locate(header) && persistence.locate(header).path;
      if (typeof p === "string") return assertInside(dirname(p), root, sessionId);
    } catch (e) {  }
  }
  let projects = [];
  try { projects = await readdir(root, { withFileTypes: true }); } catch (e) { return undefined; }
  for (const proj of projects) {
    if (!proj.isDirectory() || proj.isSymbolicLink()) continue;
    const dir = join(root, proj.name, sessionId);
    for (const fn of ARTIFACT_NAMES) {
      try {
        await stat(join(dir, fn));
        return assertInside(dir, root, sessionId);
      } catch (e) {  }
    }
  }
  return undefined;
}

export function apply(ctx) {
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
            const url = new URL(req.url || "/", "http://localhost");
            const path = url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) || "/" : "/";
            if (req.method !== "POST" || path !== "/delete") return send(res, 404, { ok: false, error: "not found" });
            const raw = await readBody(req);
            let body = {};
            if (raw.trim() !== "") {
              try { body = JSON.parse(raw); } catch (e) { return send(res, 400, { ok: false, error: "请求体不是合法 JSON" }); }
            }
            const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
            if (!ID_RE.test(sessionId)) return send(res, 400, { ok: false, error: "非法会话 id" });

            const persistence = svc(ctx, "sessionPersistence");
            const header = await headerOf(ctx, sessionId, persistence);
            if (!header) return send(res, 404, { ok: false, error: "找不到该会话" });
            if (header.origin !== "subagent") return send(res, 403, { ok: false, error: "只允许删除子智能体会话" });

            const agents = svc(ctx, "agents");
            let agent;
            try { agent = agents && agents.get && agents.get(sessionId); } catch (e) {  }
            const running = !!(agent && (agent.status === "running" || agent.busy === true));
            if (running && body.stopActivity !== true) {
              return send(res, 409, { ok: false, code: "running", error: "该子智能体仍在运行中；确认停止后再删" });
            }
            try { if (running && agent && typeof agent.cancel === "function") agent.cancel({ kind: "user" }); } catch (e) {  }
            const registry = svc(ctx, "workspaceRegistry");
            try {
              if (registry && typeof registry.stopSessionActivity === "function") await registry.stopSessionActivity(sessionId);
              else if (typeof ctx.parallel === "function") await ctx.parallel("workspace/session-stop", { sessionId });
            } catch (e) {  }

            const sessions = svc(ctx, "sessions");
            let detached = false;
            try {
              const entry = sessions && sessions.store && sessions.store.get && sessions.store.get(sessionId);
              if (entry && typeof entry.detach === "function") { entry.detach(); detached = true; }
            } catch (e) {  }
            if (!detached) { try { ctx.emit("session/disposed", { id: sessionId }); } catch (e) {  } }

            const root = sessionsRoot(ctx);
            const dir = await locateDir(persistence, header, root, sessionId);
            let filesRemoved = false;
            if (dir) { await rm(dir, { recursive: true, force: true }); filesRemoved = true; }

            try { if (registry && typeof registry.unarchiveSession === "function") await registry.unarchiveSession(sessionId); } catch (e) {  }

            if (ctx.logger && ctx.logger.info) ctx.logger.info(`subagent-fold: deleted subagent session ${sessionId}`);
            return send(res, 200, { ok: true, deleted: true, sessionId, filesRemoved });
          } catch (err) {
            return send(res, 500, { ok: false, error: String((err && err.message) || err) });
          }
        },
      });
    } catch (e) {
      if (ctx.logger && ctx.logger.warn) ctx.logger.warn("subagent-fold: 删除路由注册失败 " + String(e));
      return;
    }
    return () => {
      try {
        if (typeof handle === "function") handle();
        else if (handle && typeof handle.dispose === "function") handle.dispose();
      } catch (e) {  }
    };
  }, "dsh-subagent-fold: delete-api");
}
