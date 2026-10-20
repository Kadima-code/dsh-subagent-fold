window.__ModuleLoader__.load({
  id: "@dsh-external/dsh-subagent-fold",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");

    const NS = "dsh-subagent-fold";
    const SLOT = "conversation.session.header.actions";
    const GROUP_ORDER = ["history", "today", "prev"];

    const GROUP_LABEL = { history: "历史", today: "今日", prev: "上次", current: "本次" };

    const BATCH_GAP_MS = 120 * 1000;

    const live = { rows: null };

    const CSS = [
      ".dsf-hist-toggle{display:flex;align-items:center;gap:6px;width:100%;padding:6px 8px;margin:2px 0;border:0;background:transparent;border-radius:6px;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:left;font-family:inherit;user-select:none}",
      ".dsf-hist-toggle:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}",
      ".dsf-hist-toggle > *{pointer-events:none}",

      ".dsf-group-label{display:flex;align-items:center;gap:6px;width:100%;padding:6px 8px;margin:2px 0;border:0;background:transparent;border-radius:6px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:left;font-family:inherit;user-select:none;cursor:default}",

      "[data-dsf-tree=\"1\"]:not([data-dsf-open-history=\"1\"]) [data-dsf-hist=\"history\"]{display:none !important}",
      "[data-dsf-tree=\"1\"]:not([data-dsf-open-today=\"1\"]) [data-dsf-hist=\"today\"]{display:none !important}",
      "[data-dsf-tree=\"1\"]:not([data-dsf-open-prev=\"1\"]) [data-dsf-hist=\"prev\"]{display:none !important}",
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

    function classify(items, labels) {
      const lr = live.rows;
      if (lr && lr.length === items.length) {

        let ok = true;
        for (let i = 0; i < items.length; i++) {
          const want = (lr[i] && lr[i].label) || "";
          if (want && (labels[i] || "").indexOf(want) !== 0) { ok = false; break; }
        }
        if (ok) return lr.map(function (r) { return (r && r.group) || "current"; });
      }
      const out = [];
      for (let i = 0; i < items.length; i++) out.push("current");
      return out;
    }

    function enhanceTree(tree) {
      const items = Array.prototype.slice.call(tree.querySelectorAll('[role="treeitem"]'));
      if (items.length === 0) return;
      if (tree.getAttribute("data-dsf-tree") !== "1") tree.setAttribute("data-dsf-tree", "1");
      const labels = items.map(labelOf);
      const groups = classify(items, labels);

      const idxByGroup = { history: [], today: [], prev: [], current: [] };
      for (let i = 0; i < items.length; i++) {
        const g = groups[i] || "history";
        (idxByGroup[g] || idxByGroup.history).push(i);

        if (g === "current") {
          if (items[i].getAttribute("data-dsf-hist") !== null) items[i].removeAttribute("data-dsf-hist");
        } else if (items[i].getAttribute("data-dsf-hist") !== g) {
          items[i].setAttribute("data-dsf-hist", g);
        }
      }

      for (let gi = 0; gi < GROUP_ORDER.length; gi++) {
        const g = GROUP_ORDER[gi];
        const idxs = idxByGroup[g] || [];
        const openAttr = "data-dsf-open-" + g;
        let toggle = tree.querySelector('[data-dsf-hist-toggle="' + g + '"]');
        if (idxs.length === 0) {
          if (toggle) toggle.remove();
          tree.removeAttribute(openAttr);
          continue;
        }
        if (!tree.hasAttribute(openAttr)) tree.setAttribute(openAttr, "0");
        if (!toggle) {
          toggle = document.createElement("button");
          toggle.type = "button";
          toggle.setAttribute("data-dsf-hist-toggle", g);
          toggle.setAttribute("data-dsf-group", g);
          toggle.className = "dsf-hist-toggle";
          const first = wrapOf(items[idxs[0]], tree);
          first.parentNode.insertBefore(toggle, first);
        }
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
          curLabel.className = "dsf-group-label";
          curLabel.setAttribute("data-dsf-group-label", "current");
          const first = wrapOf(items[curIdxs[0]], tree);
          first.parentNode.insertBefore(curLabel, first);
        }
        const txt = GROUP_LABEL.current + " " + curIdxs.length;
        if (curLabel.textContent !== txt) curLabel.textContent = txt;
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
    let lastHoverAt = 0;
    let menuSince = 0;
    let menuScrollHandler = null;
    const pendingTimers = [];
    function later(fn, ms) {
      const id = setTimeout(function () { try { fn(); } catch (e) {} }, ms);
      pendingTimers.push(id);
      return id;
    }
    function clearPending() {
      while (pendingTimers.length) { try { clearTimeout(pendingTimers.pop()); } catch (e) {} }
    }
    const MENU_MAX_MS = 5 * 60 * 1000;

    function enhanceOnce() {
      if (disposed) return;
      patchTriggers();
      if (!menuEl || !menuEl.isConnected) { if (menuEl) detachMenu(); return; }

      try { if (!menuEl.getClientRects || menuEl.getClientRects().length === 0) { detachMenu(); return; } } catch (e) {}
      if (menuSince && Date.now() - menuSince > MENU_MAX_MS) { detachMenu(); return; }
      const trees = subagentTrees(menuEl);
      for (let i = 0; i < trees.length; i++) { try { enhanceTree(trees[i]); } catch (e) {} }
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

    function onTriggerHover(ev) {
      try { ev.stopImmediatePropagation(); } catch (e) { try { ev.stopPropagation(); } catch (_) {} }
      const trig = ev.currentTarget;
      const now = Date.now();
      if (now - lastHoverAt < 300) return;
      lastHoverAt = now;
      later(function () {
        try { trig.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body })); } catch (e) {}
      }, 0);
    }
    function patchTriggers() {
      if (disposed) return;
      const btns = document.querySelectorAll('button[aria-haspopup="tree"]');
      for (let i = 0; i < btns.length; i++) {
        const b = btns[i];
        if (b.__dsfHoverPatched) continue;
        b.__dsfHoverPatched = true;
        try { b.addEventListener("mouseover", onTriggerHover, true); } catch (e) {}
      }
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
          try {
            const ts = document.querySelectorAll('[data-dsf-hist-toggle]');
            for (let i = 0; i < ts.length; i++) ts[i].remove();
            const labels = document.querySelectorAll('[data-dsf-group-label]');
            for (let i = 0; i < labels.length; i++) labels[i].remove();
            const items = document.querySelectorAll('[role="treeitem"]');
            for (let i = 0; i < items.length; i++) { try { items[i].removeAttribute("data-dsf-hist"); } catch (e) {} }
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

      patchTriggers();
      later(patchTriggers, 500);
      later(patchTriggers, 1500);
      later(patchTriggers, 3000);

      function SubagentFoldHelper(props) {
        const sessionId = props.sessionId;
        const useSessions = typeof props.useSessions === "function" ? props.useSessions : function () { return undefined; };
        const useSessionStatus = typeof props.useSessionStatus === "function" ? props.useSessionStatus : function () { return undefined; };

        const summaries = useSessions(function (s) { return s.byId; });
        const projections = useSessions(function (s) { return s.projectionsBySession; });
        const statuses = useSessionStatus(function (v) { return v; });

        const self = summaries ? summaries[sessionId] : undefined;
        const isSubagent = !!(self && self.origin === "subagent");
        const rootId = isSubagent ? null : ((self && self.parentId) || sessionId);
        const proj = (rootId && projections) ? projections[rootId] : undefined;
        const raw = (proj && proj.values) ? proj.values.subagentCatalog : undefined;

        const rows = React.useMemo(function () {
          if (isSubagent || !raw) return null;
          const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
          const todayStart = midnight.getTime();

          const sorted = raw.map(function (e, i) { return { i: i, at: Number(e.createdAt) || 0 }; })
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

          return raw.map(function (e, i) {
            const sm = summaries ? summaries[e.id] : undefined;
            const st = (statuses && typeof statuses.get === "function") ? statuses.get(e.id) : undefined;
            const running = !!((st && st.running) || (sm && sm.running));
            const createdAt = Number(e.createdAt) || 0;
            const r = rank[i] === undefined ? 99 : rank[i];
            let group;
            if (running || r === 0) group = "current";
            else if (r === 1) group = "prev";
            else if (createdAt >= todayStart) group = "today";
            else group = "history";
            return { id: e.id, label: e.label || e.id, running: running, createdAt: createdAt, group: group };
          });
        }, [raw, summaries, statuses, isSubagent]);

        const sig = rows ? rows.map(function (r) { return r.group.charAt(0) + (r.running ? "1" : "0") + r.id; }).join(",") : "";
        React.useEffect(function () {
          live.rows = rows;
          try { if (menuEl && menuEl.isConnected) schedule(); } catch (e) {}
        }, [sig]);
        React.useEffect(function () { return function () { live.rows = null; }; }, []);
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

    exports.name = "@dsh-external/dsh-subagent-fold";
    exports.inject = ["slots"];
    exports.apply = apply;
    return module.exports;
  },
});
