window.__ModuleLoader__.load({
  id: "@dsh-external/dsh-subagent-toolkit",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");

    const NS = "dsh-subagent-fold";
    const SLOT = "conversation.session.header.actions";
    const GROUP_ORDER = ["history", "today", "prev"];

    const GROUP_LABEL = { history: "历史", today: "今日", prev: "上次", current: "本次" };

    const BATCH_GAP_MS = 120 * 1000;

    const DEL_KEY = "dsh-subagent-fold:deleted";
    function loadDeleted() {
      try {
        const raw = localStorage.getItem(DEL_KEY) || "[]";
        const arr = JSON.parse(raw);
        const o = {};
        if (Array.isArray(arr)) for (let i = 0; i < arr.length; i++) if (typeof arr[i] === "string") o[arr[i]] = 1;
        return o;
      } catch (e) { return {}; }
    }
    function saveDeleted() {
      try { localStorage.setItem(DEL_KEY, JSON.stringify(Object.keys(live.deleted).slice(-2000))); } catch (e) {}
    }
    const live = { sets: [], deleted: loadDeleted() };
    let lastRows = null;
    let groupIds = { history: [], today: [], prev: [], current: [] };
    let curMenu = null;

    const CSS = [
      ".dsf-group-head{display:flex;align-items:center;gap:2px;width:100%;padding-right:8px;box-sizing:border-box}",
      ".dsf-group-label-text{flex:1;padding:6px 8px;font-size:12px;color:var(--dsw-alias-label-secondary);user-select:none;cursor:default}",
      ".dsf-group-del{flex:0 0 auto;width:20px;height:20px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:14px;line-height:20px;text-align:center;cursor:pointer;font-family:inherit;opacity:.5}",
      ".dsf-group-del:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-feedback-danger,#d33);opacity:1}",
      ".dsf-hist-toggle{display:flex;align-items:center;gap:6px;flex:1;width:auto;padding:6px 8px;margin:2px 0;border:0;background:transparent;border-radius:6px;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:left;font-family:inherit;user-select:none}",
      ".dsf-hist-toggle:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}",
      ".dsf-hist-toggle > *{pointer-events:none}",

      ".dsf-group-label{display:flex;align-items:center;gap:6px;width:100%;padding:6px 8px;margin:2px 0;border:0;background:transparent;border-radius:6px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:left;font-family:inherit;user-select:none;cursor:default}",

      "[data-dsf-tree=\"1\"]:not([data-dsf-open-history=\"1\"]) [data-dsf-hist=\"history\"]{display:none !important}",
      "[data-dsf-tree=\"1\"]:not([data-dsf-open-today=\"1\"]) [data-dsf-hist=\"today\"]{display:none !important}",
      "[data-dsf-tree=\"1\"]:not([data-dsf-open-prev=\"1\"]) [data-dsf-hist=\"prev\"]{display:none !important}",
      "[data-dsf-tree=\"1\"] [data-dsf-dead=\"1\"]{display:none !important}",

      ".dsf-row-menu{flex:0 0 auto;width:22px;height:22px;margin-left:6px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:14px;line-height:22px;text-align:center;cursor:pointer;font-family:inherit}",
      ".dsf-row-menu:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}",
      ".dsf-menu{position:fixed;z-index:1060;min-width:168px;padding:4px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.18);font-family:inherit}",
      ".dsf-menu-title{padding:6px 10px 4px;font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}",
      ".dsf-menu-item{display:block;width:100%;padding:7px 10px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;text-align:left;cursor:pointer;font-family:inherit}",
      ".dsf-menu-item:hover{background:var(--dsw-alias-bg-layer-3)}",
      ".dsf-menu-item.danger{color:var(--dsw-alias-feedback-danger,#d33)}",
    ].join("\n");

    const MODE_RE = /一次性|可继续|外部任务|模式未知|one-shot|continuable|external|unknown/i;

    let t = function (k) { return GROUP_LABEL[k] || k; };

    function labelOf(el) {
      const a = el.getAttribute && el.getAttribute("aria-label");
      if (a) return a;
      return (el.textContent || "").replace(/\s+/g, " ").trim();
    }

    function subagentTrees(scope) {
      const root = scope || document;
      const trees = root.querySelectorAll('[role="tree"]');
      const out = [];
      for (let i = 0; i < trees.length; i++) {
        const tree = trees[i];
        if ((tree.getAttribute("aria-label") || "") === "会话") continue;
        const items = tree.querySelectorAll('[role="treeitem"]');
        if (items.length === 0) continue;
        let looks = false;
        for (let j = 0; j < items.length; j++) { if (MODE_RE.test(labelOf(items[j]))) { looks = true; break; } }
        if (looks) out.push(tree);
      }
      return out;
    }

    function wrapOf(el, tree) {
      const p = el.parentElement;
      if (p && p !== tree && p.getAttribute && !p.getAttribute("role")) return p;
      return el;
    }

    function matchRows(items, labels) {
      const sets = live.sets || [];

      for (let s = 0; s < sets.length; s++) {
        const lr = sets[s];
        if (!lr || lr.length !== items.length) continue;
        let ok = true;
        for (let i = 0; i < items.length; i++) {
          const want = (lr[i] && lr[i].label) || "";
          if (want && (labels[i] || "").indexOf(want) !== 0) { ok = false; break; }
        }
        if (ok) return lr;
      }
      return null;
    }

    function enhanceTree(tree) {
      const items = Array.prototype.slice.call(tree.querySelectorAll('[role="treeitem"]'));
      if (items.length === 0) return;
      if (tree.getAttribute("data-dsf-tree") !== "1") tree.setAttribute("data-dsf-tree", "1");
      const labels = items.map(labelOf);
      const rows = matchRows(items, labels);

      const groups = rows ? rows.map(function (r) {
        if (r && live.deleted[r.id]) return "dead";
        return (r && r.group) || "current";
      }) : (function () { const o = []; for (let i = 0; i < items.length; i++) o.push("current"); return o; })();

      const idxByGroup = { history: [], today: [], prev: [], current: [], dead: [] };
      for (let i = 0; i < items.length; i++) {
        const g = groups[i] || "history";
        (idxByGroup[g] || idxByGroup.history).push(i);

        const el = items[i];
        if (g === "dead") {
          if (el.getAttribute("data-dsf-dead") !== "1") el.setAttribute("data-dsf-dead", "1");
          if (el.getAttribute("data-dsf-hist") !== null) el.removeAttribute("data-dsf-hist");
          const old = el.querySelector('[data-dsf-row-menu]'); if (old) old.remove();
          continue;
        }
        if (el.getAttribute("data-dsf-dead") !== null) el.removeAttribute("data-dsf-dead");
        if (g === "current") {
          if (el.getAttribute("data-dsf-hist") !== null) el.removeAttribute("data-dsf-hist");
        } else if (el.getAttribute("data-dsf-hist") !== g) {
          el.setAttribute("data-dsf-hist", g);
        }

        if (rows && rows[i] && rows[i].id) {
          let mb = el.querySelector('[data-dsf-row-menu]');
          if (!mb) {
            mb = document.createElement("button");
            mb.type = "button";
            mb.className = "dsf-row-menu";
            mb.setAttribute("data-dsf-row-menu", "1");
            mb.setAttribute("aria-label", "更多操作");
            mb.textContent = "⋯";
            el.appendChild(mb);
          }
          const sidNow = rows[i].id;
          const titleNow = (rows[i].label || "").slice(0, 60);
          const runNow = rows[i].running ? "1" : "0";
          if (mb.getAttribute("data-dsf-sid") !== sidNow) mb.setAttribute("data-dsf-sid", sidNow);
          if (mb.getAttribute("data-dsf-title") !== titleNow) mb.setAttribute("data-dsf-title", titleNow);
          if (mb.getAttribute("data-dsf-running") !== runNow) mb.setAttribute("data-dsf-running", runNow);
          if (mb.getAttribute("data-dsf-group") !== (rows[i].group || "current")) mb.setAttribute("data-dsf-group", rows[i].group || "current");
        }
      }
      const treeGroupIds = { history: [], today: [], prev: [], current: [] };
      if (rows) {
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (r && r.id && !live.deleted[r.id]) (treeGroupIds[r.group || "current"] || treeGroupIds.current).push(r.id);
        }
      }
      try { tree.__dsfGroupIds = treeGroupIds; } catch (e) {}
      groupIds = treeGroupIds;

      for (let gi = 0; gi < GROUP_ORDER.length; gi++) {
        const g = GROUP_ORDER[gi];
        const idxs = idxByGroup[g] || [];
        const openAttr = "data-dsf-open-" + g;
        let head = tree.querySelector('[data-dsf-group-head="' + g + '"]');
        if (idxs.length === 0) {
          if (head) head.remove();
          tree.removeAttribute(openAttr);
          continue;
        }
        if (!head) {
          head = document.createElement("div");
          head.className = "dsf-group-head";
          head.setAttribute("data-dsf-group-head", g);
          const first = wrapOf(items[idxs[0]], tree);
          first.parentNode.insertBefore(head, first);
        }
        if (!tree.hasAttribute(openAttr)) tree.setAttribute(openAttr, "0");
        let toggle = head.querySelector('[data-dsf-hist-toggle]');
        if (!toggle) {
          toggle = document.createElement("button");
          toggle.type = "button";
          toggle.setAttribute("data-dsf-hist-toggle", g);
          toggle.setAttribute("data-dsf-group", g);
          toggle.className = "dsf-hist-toggle";
          head.appendChild(toggle);
        }
        let gdel = head.querySelector('[data-dsf-group-del]');
        if (!gdel) {
          gdel = document.createElement("button");
          gdel.type = "button";
          gdel.className = "dsf-row-menu";
          gdel.setAttribute("data-dsf-group-del", g);
          gdel.title = "删除本组";
          gdel.setAttribute("aria-label", "删除本组");
          gdel.textContent = "⋯";
          head.appendChild(gdel);
        }
        if (gdel.getAttribute("data-dsf-count") !== String(idxs.length)) gdel.setAttribute("data-dsf-count", String(idxs.length));
        paintGroup(tree, toggle, g, idxs.length);
      }


      const curIdxs = idxByGroup.current || [];
      const foldedCount = (idxByGroup.history || []).length + (idxByGroup.today || []).length + (idxByGroup.prev || []).length;
      let curLabel = tree.querySelector('[data-dsf-group-label="current"]');
      if (curIdxs.length === 0 || foldedCount === 0) {
        if (curLabel) curLabel.remove();
      } else {
        if (!curLabel) {
          curLabel = document.createElement("div");
          curLabel.className = "dsf-group-head";
          curLabel.setAttribute("data-dsf-group-label", "current");
          const first = wrapOf(items[curIdxs[0]], tree);
          first.parentNode.insertBefore(curLabel, first);
        }
        let lbl = curLabel.querySelector('[data-dsf-label-text]');
        if (!lbl) { lbl = document.createElement("span"); lbl.className = "dsf-group-label-text"; lbl.setAttribute("data-dsf-label-text", "1"); curLabel.appendChild(lbl); }
        const txt = GROUP_LABEL.current + " " + curIdxs.length;
        if (lbl.textContent !== txt) lbl.textContent = txt;
        let cdel = curLabel.querySelector('[data-dsf-group-del]');
        if (!cdel) {
          cdel = document.createElement("button");
          cdel.type = "button";
          cdel.className = "dsf-row-menu";
          cdel.setAttribute("data-dsf-group-del", "current");
          cdel.title = "删除本组";
          cdel.setAttribute("aria-label", "删除本组");
          cdel.textContent = "⋯";
          curLabel.appendChild(cdel);
        }
        if (cdel.getAttribute("data-dsf-count") !== String(curIdxs.length)) cdel.setAttribute("data-dsf-count", String(curIdxs.length));
      }
    }

    function paintGroup(tree, toggle, g, count) {
      const opened = tree.getAttribute("data-dsf-open-" + g) === "1";
      toggle.setAttribute("data-open", opened ? "1" : "0");
      const text = t(g) + " " + count;
      if (toggle.textContent !== text) toggle.textContent = text;
    }

    let menuEl = null;
    let menuObs = null;
    let menuTimer = null;
    let scheduled = false;
    let disposed = false;
    let menuSince = 0;
    let menuScrollHandler = null;
    const pendingTimers = [];
    function later(fn, ms) {
      const id = setTimeout(function () {
        const at = pendingTimers.indexOf(id);
        if (at >= 0) pendingTimers.splice(at, 1);
        try { fn(); } catch (e) {}
      }, ms);
      pendingTimers.push(id);
      return id;
    }
    function clearPending() {
      while (pendingTimers.length) { try { clearTimeout(pendingTimers.pop()); } catch (e) {} }
    }
    const MENU_MAX_MS = 5 * 60 * 1000;

    function enhanceOnce() {
      if (disposed) return;
      if (!menuEl || !menuEl.isConnected) { if (menuEl) detachMenu(); return; }

      try { if (!menuEl.getClientRects || menuEl.getClientRects().length === 0) { detachMenu(); return; } } catch (e) {}
      if (menuSince && Date.now() - menuSince > MENU_MAX_MS) { detachMenu(); return; }
      const trees = subagentTrees(menuEl);
      for (let i = 0; i < trees.length; i++) { try { enhanceTree(trees[i]); } catch (e) {} }
      try { adjustTriggerCount(); } catch (e) {}
      try { if (menuObs) menuObs.takeRecords(); } catch (e) {}
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      const raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
      raf(function () { scheduled = false; try { enhanceOnce(); } catch (e) {} });
    }

    function attachMenu(node) {
      if (disposed || !node || !node.isConnected) return;
      const tree = node.querySelector && node.querySelector('[role="tree"]');
      if (!tree) return;
      const items = tree.querySelectorAll('[role="treeitem"]');
      if (items.length === 0) return;
      let looks = false;
      for (let j = 0; j < items.length; j++) { if (MODE_RE.test(labelOf(items[j]))) { looks = true; break; } }
      if (!looks) return;
      menuEl = node;
      menuSince = Date.now();
      enhanceOnce();
      if (menuObs) { try { menuObs.disconnect(); } catch (e) {} }
      menuObs = new MutationObserver(function () { schedule(); });
      try { menuObs.observe(node, { childList: true, subtree: true, characterData: true }); } catch (e) {}

      if (menuTimer) { try { clearInterval(menuTimer); } catch (e) {} }
      menuTimer = setInterval(function () { schedule(); }, 1000);
      if (menuScrollHandler && menuEl) { try { menuEl.removeEventListener("scroll", menuScrollHandler, true); } catch (e) {} }
      menuScrollHandler = function () { schedule(); };
      try { menuEl.addEventListener("scroll", menuScrollHandler, true); } catch (e) {}
    }

    function detachMenu() {
      if (menuObs) { try { menuObs.disconnect(); } catch (e) {} }
      if (menuTimer) { try { clearInterval(menuTimer); } catch (e) {} }
      if (menuEl && menuScrollHandler) { try { menuEl.removeEventListener("scroll", menuScrollHandler, true); } catch (e) {} }
      menuObs = null; menuTimer = null; menuScrollHandler = null; menuEl = null; menuSince = 0;
    }

    function scanBodyForMenu() {
      if (disposed) return;
      const kids = document.body.children;
      for (let i = 0; i < kids.length; i++) {
        const n = kids[i];
        if (n.querySelector && n.querySelector('[role="tree"]')) { attachMenu(n); return; }
      }
    }

    function closeRowMenu() {
      if (curMenu && curMenu.el) { try { curMenu.el.remove(); } catch (e) {} }
      curMenu = null;
    }

    function subCountReplace(str, target) {
      return String(str).replace(/([0-9]+)( *(?:个子智能体|subagents?))/i, function (_m, _n, unit) { return String(target) + unit; });
    }
    function adjustTriggerCount() {
      const rows = lastRows;
      if (!rows || !rows.length) return;
      const total = rows.length;
      let dec = 0;
      for (let i = 0; i < rows.length; i++) if (rows[i] && live.deleted[rows[i].id]) dec++;
      const target = total - dec;

      const btns = document.querySelectorAll('button[aria-haspopup="tree"]');
      for (let b = 0; b < btns.length; b++) {
        const btn = btns[b];
        const al = btn.getAttribute("aria-label") || "";
        const tc = btn.textContent || "";
        if (!/(?:子智能体|subagent)/i.test(al) && !/(?:子智能体|subagent)/i.test(tc)) continue;

        if (al !== subCountReplace(al, target)) btn.setAttribute("aria-label", subCountReplace(al, target));
        try {
          const w = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT, null);
          let n;
          while ((n = w.nextNode())) {
            const nextVal = subCountReplace(n.nodeValue || "", target);
            if (n.nodeValue !== nextVal) { n.nodeValue = nextVal; break; }
          }
        } catch (e) {}
      }
    }

    function openRowMenu(btn, sid, title, running) {
      closeRowMenu();
      const host = menuEl || document.body;
      const el = document.createElement("div");
      el.className = "dsf-menu";
      el.setAttribute("data-dsf-menu", "1");
      const head = document.createElement("div");
      head.className = "dsf-menu-title";
      head.textContent = title || sid;
      el.appendChild(head);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "dsf-menu-item danger";
      del.setAttribute("data-dsf-menu-item", "delete");
      del.textContent = running ? "删除（会先停止运行）" : "删除子智能体";
      el.appendChild(del);
      host.appendChild(el);

      try {
        const r = btn.getBoundingClientRect();
        const w = el.offsetWidth || 180;
        const h = el.offsetHeight || 80;
        let left = Math.min(r.right - w, window.innerWidth - w - 8);
        if (left < 8) left = 8;
        let top = r.bottom + 4;
        if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
        el.style.left = left + "px";
        el.style.top = top + "px";
      } catch (e) {}
      curMenu = { el: el, sid: sid, title: title, running: running };
    }


    async function doDelete(sid, title, running) {
      const msg = "删除子智能体会话「" + (title || sid) + "」？\n此操作不可恢复。";
      if (running) {
        if (!window.confirm(msg + "\n该会话正在运行，删除会先停止它。")) return;
      } else if (!window.confirm(msg)) {
        return;
      }
      const payload = { sessionId: sid };
      if (running) payload.stopActivity = true;
      let via = "";

      try {
        const r = await fetch("/session-manager/api/delete", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
        });
        if (r.ok) { const j = await r.json().catch(function () { return {}; }); if (j && j.ok !== false) via = "session-manager"; }
      } catch (e) {  }

      if (!via) {
        try {
          const r = await fetch("/subagent-fold/api/delete", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
          });
          const j = await r.json().catch(function () { return {}; });
          if (!r.ok || (j && j.ok === false)) throw new Error((j && (j.error || (j.failed && j.failed[0] && j.failed[0].error))) || ("删除失败 " + r.status));
          via = "self";
        } catch (e) {
          const msg = String((e && e.message) || e);
          if (/找不到该会话/.test(msg)) {
            live.deleted[sid] = true; saveDeleted(); closeRowMenu();
            try { adjustTriggerCount(); } catch (err) {}
            later(function () { adjustTriggerCount(); }, 100);
            later(function () { adjustTriggerCount(); }, 300);
            try { if (menuEl && menuEl.isConnected) schedule(); } catch (err) {}
            return;
          }
          window.alert("删除失败：" + msg);
          return;
        }
      }
      live.deleted[sid] = true;
      saveDeleted();
      closeRowMenu();
      try { adjustTriggerCount(); } catch (e) {}
      later(function () { adjustTriggerCount(); }, 100);
      later(function () { adjustTriggerCount(); }, 300);
      try { if (menuEl && menuEl.isConnected) schedule(); } catch (e) {}
    }


    function openGroupMenu(btn, group) {
      closeRowMenu();
      let ids = [];
      try {
        const tree = btn && btn.closest ? btn.closest('[role="tree"]') : null;
        const perTree = tree && tree.__dsfGroupIds;
        ids = (perTree && perTree[group]) || groupIds[group] || [];
      } catch (e) { ids = groupIds[group] || []; }
      const host = menuEl || document.body;
      const el = document.createElement("div");
      el.className = "dsf-menu";
      el.setAttribute("data-dsf-menu", "1");
      const head = document.createElement("div");
      head.className = "dsf-menu-title";
      head.textContent = (t(group) || group) + " · " + ids.length + " 个";
      el.appendChild(head);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "dsf-menu-item danger";
      del.setAttribute("data-dsf-menu-item", "delete-group");
      del.textContent = "删除本组（" + ids.length + " 个）";
      el.appendChild(del);
      host.appendChild(el);
      try {
        const r = btn.getBoundingClientRect();
        const w = el.offsetWidth || 180;
        const h = el.offsetHeight || 80;
        let left = Math.min(r.right - w, window.innerWidth - w - 8);
        if (left < 8) left = 8;
        let top = r.bottom + 4;
        if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
        el.style.left = left + "px";
        el.style.top = top + "px";
      } catch (e) {}
      curMenu = { el: el, sid: null, title: (t(group) || group), running: false, group: group };
    }


    async function doDeleteGroup(group) {
      const ids = (groupIds[group] || []).slice();
      if (!ids.length) { window.alert("该组没有可删除的子智能体"); return; }
      const label = t(group) || group;
      if (!window.confirm("删除「" + label + "」整组的 " + ids.length + " 个子智能体会话？此操作不可恢复；运行中的会先停止。")) return;
      let deleted = [], failed = [];
      try {
        const r = await fetch("/subagent-fold/api/delete", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionIds: ids, stopActivity: true }),
        });
        const j = await r.json().catch(function () { return {}; });
        if (!r.ok || !j) throw new Error("HTTP " + r.status + " " + ((j && j.error) || ""));
        deleted = Array.isArray(j.deleted) ? j.deleted : [];
        failed = Array.isArray(j.failed) ? j.failed : [];
        const gone = failed.filter(function (f) { return f && /找不到该会话/.test(f.error || ""); }).map(function (f) { return f.sessionId; });
        for (let i = 0; i < gone.length; i++) if (gone[i]) live.deleted[gone[i]] = 1;
        failed = failed.filter(function (f) { return !(f && /找不到该会话/.test(f.error || "")); });
      } catch (e) {
        window.alert("整组删除失败：" + String((e && e.message) || e));
        return;
      }
      for (let i = 0; i < deleted.length; i++) live.deleted[deleted[i]] = 1;
      saveDeleted();
      closeRowMenu();
      try { adjustTriggerCount(); } catch (e) {}
      later(function () { adjustTriggerCount(); }, 100);
      later(function () { adjustTriggerCount(); }, 300);
      try { if (menuEl && menuEl.isConnected) schedule(); } catch (e) {}
      if (failed.length) window.alert("已删 " + deleted.length + " 个，" + failed.length + " 个失败（前 5 条）：" + failed.slice(0, 5).map(function (f) { return (f.sessionId || "") + " " + (f.error || ""); }).join("；"));
    }

    function apply(ctx) {
      const slots = ctx.get("slots");


      ctx.effect(function () {
        const el = document.createElement("style");
        el.setAttribute("data-plugin-css", NS);
        el.textContent = CSS;
        document.head.appendChild(el);
        return function () { try { el.remove(); } catch (e) {} };
      }, NS + ": css");


      ctx.effect(function () {
        function hasTree(n) { return n && n.nodeType === 1 && n.querySelector && n.querySelector('[role="tree"]'); }
        const bodyObs = new MutationObserver(function (records) {
          for (let i = 0; i < records.length; i++) {
            const r = records[i];
            for (let a = 0; a < r.addedNodes.length; a++) { if (hasTree(r.addedNodes[a])) { attachMenu(r.addedNodes[a]); return; } }
            for (let d = 0; d < r.removedNodes.length; d++) {
              const n = r.removedNodes[d];
              if (menuEl && (n === menuEl || (n.contains && n.contains(menuEl)))) { detachMenu(); return; }
            }
          }
        });
        try { bodyObs.observe(document.body, { childList: true }); } catch (e) {}
        return function () {
          disposed = true;
          clearPending();
          try { bodyObs.disconnect(); } catch (e) {}
          try { detachMenu(); } catch (e) {}
          try { closeRowMenu(); } catch (e) {}
          try {
            const ts = document.querySelectorAll('[data-dsf-hist-toggle]');
            for (let i = 0; i < ts.length; i++) ts[i].remove();
            const labels = document.querySelectorAll('[data-dsf-group-label]');
            for (let i = 0; i < labels.length; i++) labels[i].remove();
            const rm = document.querySelectorAll('[data-dsf-row-menu]');
            for (let i = 0; i < rm.length; i++) rm[i].remove();
            const heads = document.querySelectorAll('[data-dsf-group-head]');
            for (let i = 0; i < heads.length; i++) heads[i].remove();
            const gds = document.querySelectorAll('[data-dsf-group-del]');
            for (let i = 0; i < gds.length; i++) gds[i].remove();
            const items = document.querySelectorAll('[role="treeitem"]');
            for (let i = 0; i < items.length; i++) {
              try {
                items[i].removeAttribute("data-dsf-hist");
                items[i].removeAttribute("data-dsf-dead");
              } catch (e) {}
            }
            const trees = document.querySelectorAll('[data-dsf-tree]');
            for (let i = 0; i < trees.length; i++) {
              trees[i].removeAttribute("data-dsf-tree");
              trees[i].removeAttribute("data-dsf-open-history");
              trees[i].removeAttribute("data-dsf-open-today");
              trees[i].removeAttribute("data-dsf-open-prev");
            }
          } catch (e) {}
        };
      }, NS + ": body-observer");


      ctx.effect(function () {
        function onClick(ev) {
          const target = ev.target;
          if (!target || !target.closest) return;

          const menuItem = target.closest('[data-dsf-menu-item]');
          if (menuItem) {
            ev.preventDefault(); ev.stopPropagation();
            const action = menuItem.getAttribute("data-dsf-menu-item");
            const sid = curMenu && curMenu.sid;
            const title = (curMenu && curMenu.title) || "";
            const running = curMenu && curMenu.running;
            const group = curMenu && curMenu.group;
            if (action === "delete" && sid) doDelete(sid, title, running);
            else if (action === "delete-group" && curMenu && curMenu.group) doDeleteGroup(curMenu.group);
            else if (action === "delete-group" && group) doDeleteGroup(group);
            return;
          }
          const gdel = target.closest('[data-dsf-group-del]');
          if (gdel) {
            ev.preventDefault(); ev.stopPropagation();
            const g = gdel.getAttribute("data-dsf-group-del");
            if (g) openGroupMenu(gdel, g);
            return;
          }
          const rowBtn = target.closest('[data-dsf-row-menu]');
          if (rowBtn) {
            ev.preventDefault(); ev.stopPropagation();
            const sid = rowBtn.getAttribute("data-dsf-sid");
            if (!sid) return;
            openRowMenu(rowBtn, sid, rowBtn.getAttribute("data-dsf-title") || "", rowBtn.getAttribute("data-dsf-running") === "1");
            return;
          }
          if (curMenu && !(target.closest && target.closest('[data-dsf-menu]'))) closeRowMenu();
          const toggle = target.closest('[data-dsf-hist-toggle]');
          if (toggle) {
            ev.preventDefault(); ev.stopPropagation();
            const g = toggle.getAttribute("data-dsf-group");
            const tree = toggle.closest('[role="tree"]');
            if (tree && g) {
              const attr = "data-dsf-open-" + g;
              const next = tree.getAttribute(attr) === "1" ? "0" : "1";
              tree.setAttribute(attr, next);
              const cnt = tree.querySelectorAll('[data-dsf-hist="' + g + '"]').length;
              paintGroup(tree, toggle, g, cnt);
            }
            return;
          }
          const trig = target.closest('button[aria-haspopup="tree"]');
          if (trig) {
            const openTrees = (menuEl && menuEl.isConnected) ? subagentTrees(menuEl) : [];
            if (openTrees.length > 0) {
              setTimeout(function () {
                try { trig.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); } catch (e) {}
              }, 0);
            } else {
              later(function () { scanBodyForMenu(); }, 80);
              later(function () { scanBodyForMenu(); }, 260);
            }
          }
        }
        document.addEventListener("click", onClick, true);
        return function () { try { document.removeEventListener("click", onClick, true); } catch (e) {} };
      }, NS + ": click");

      function SubagentFoldHelper(props) {
        const sessionId = props.sessionId;
        const useSessions = typeof props.useSessions === "function" ? props.useSessions : function () { return undefined; };
        const useSessionStatus = typeof props.useSessionStatus === "function" ? props.useSessionStatus : function () { return undefined; };

        const summaries = useSessions(function (s) { return s.byId; });
        const projections = useSessions(function (s) { return s.projectionsBySession; });
        const statuses = useSessionStatus(function (v) { return v; });

        const self = summaries ? summaries[sessionId] : undefined;
        const isSubagent = !!(self && self.origin === "subagent");
        const rootId = (self && self.parentId) || sessionId;

        const sets = React.useMemo(function () {
          function catOf(id) {
            const pr = (id && projections) ? projections[id] : undefined;
            return pr && pr.values ? pr.values.subagentCatalog : undefined;
          }
          function buildRows(list) {
            if (!list || !list.length) return null;
            const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
            const todayStart = midnight.getTime();

            const atOf = function (e) { return (typeof e.createdAt === "number" ? e.createdAt : (Date.parse(e.createdAt) || Number(e.createdAt) || 0)); };
            const sorted = list.map(function (e, i) { return { i: i, at: atOf(e) }; })
              .sort(function (a, b) { return a.at - b.at; });
            const batches = [];
            let cur = null;
            for (let s = 0; s < sorted.length; s++) {
              const it = sorted[s];
              if (!cur || it.at - cur.last > BATCH_GAP_MS) { cur = { last: it.at, idxs: [] }; batches.push(cur); }
              cur.last = it.at; cur.idxs.push(it.i);
            }
            const rank = {};
            batches.slice().sort(function (a, b) { return b.last - a.last; }).forEach(function (b, ri) {
              for (let x = 0; x < b.idxs.length; x++) rank[b.idxs[x]] = ri;
            });
            return list.map(function (e, i) {
              const sm = summaries ? summaries[e.id] : undefined;
              const st = (statuses && typeof statuses.get === "function") ? statuses.get(e.id) : undefined;
              const running = !!((st && st.running) || (sm && sm.running));
              const createdAt = atOf(e);
              const r = rank[i] === undefined ? 99 : rank[i];
              let group;
              if (running || r === 0) group = "current";
              else if (r === 1) group = "prev";
              else if (createdAt >= todayStart) group = "today";
              else group = "history";
              return { id: e.id, label: e.label || e.id, running: running, createdAt: createdAt, group: group };
            });
          }

          const out = [];

          if (isSubagent) {
            if (self && self.parentId) { const a = buildRows(catOf(self.parentId)); if (a) out.push(a); }
            const b = buildRows(catOf(sessionId)); if (b) out.push(b);
          } else {
            const a = buildRows(catOf(rootId)); if (a) out.push(a);
          }
          return out;
        }, [summaries, statuses, projections, sessionId, isSubagent, rootId]);

        const sig = sets.map(function (rows) {
          return rows.map(function (r) { return r.group.charAt(0) + (r.running ? "1" : "0") + r.id; }).join(",");
        }).join("|");
        React.useEffect(function () {
          live.sets = sets;
          live.owner = sessionId;
          lastRows = sets[0] || null;
          try { adjustTriggerCount(); } catch (e) {}
          try { if (menuEl && menuEl.isConnected) schedule(); } catch (e) {}
        }, [sig]);
        React.useEffect(function () { return function () { if (live.owner === sessionId) { live.sets = []; lastRows = null; live.owner = null; } }; }, [sessionId]);
        return null;
      }

      if (slots && typeof slots.inject === "function" && typeof slots.register === "function") {
        ctx.effect(function () {
          return slots.inject(SLOT, function () {
            return slots.register({
              name: "conversation.session.header.actions",
              id: "subagent-fold",
              order: 11,
              locale: NS,
            }, SubagentFoldHelper);
          });
        }, NS + ": slot");
      }
    }

    exports.name = "@dsh-external/dsh-subagent-toolkit";
    exports.inject = ["slots"];
    exports.apply = apply;
    return module.exports;
  },
});
