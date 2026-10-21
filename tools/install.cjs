#!/usr/bin/env node
// Install / uninstall: @dsh-external/dsh-subagent-fold (standard DSH bundle).
// Usage:
//   node tools/install.cjs [--profile <profileDirOrName>] [--dry-run]
//   node tools/install.cjs --uninstall [--profile ...] [--dry-run]
const fs = require("fs");
const path = require("path");

const NAME = "@dsh-external/dsh-subagent-fold";
const REPO = path.resolve(__dirname, "..");
const DRY = process.argv.includes("--dry-run");
const UNINSTALL = process.argv.includes("--uninstall");

function arg(n, d) {
  const i = process.argv.indexOf("--" + n);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
}
const home = process.env.USERPROFILE || process.env.HOME || ".";
const dshHome = process.env.DSH_HOME || path.join(home, ".dsh");
let prof = arg("profile", "desktop");
let profileDir = path.isAbsolute(prof) ? prof : path.join(dshHome, "profiles", prof);
const pjPath = path.join(profileDir, "package.json");
const EXT = path.join(dshHome, "_plugins", "dsh-subagent-fold");
const linkPath = path.join(profileDir, "node_modules", "@dsh-external", "dsh-subagent-fold");

function log(...a) { console.log(DRY ? "[dry-run]" : "", ...a); }
function fail(msg) { console.error("ERROR:", msg); process.exit(1); }

if (!fs.existsSync(pjPath)) fail("profile not found: " + profileDir);
if (!fs.existsSync(path.join(REPO, "cordis.patch.yml"))) fail("cordis.patch.yml missing in " + REPO);

const pj = JSON.parse(fs.readFileSync(pjPath, "utf8"));
pj.dependencies = pj.dependencies || {};
pj.dsh = pj.dsh || {};
pj.dsh.profile = pj.dsh.profile || {};
pj.dsh.profile.bundles = pj.dsh.profile.bundles || [];

if (UNINSTALL) {
  delete pj.dependencies[NAME];
  pj.dsh.profile.bundles = pj.dsh.profile.bundles.filter((x) => x !== NAME);
  if (!DRY) {
    const bak = pjPath + ".bak-" + Date.now();
    fs.copyFileSync(pjPath, bak);
    fs.writeFileSync(pjPath, JSON.stringify(pj, null, 2) + "\n", "utf8");
    try { fs.rmSync(linkPath, { recursive: true, force: true }); } catch (e) {}
    log("uninstalled; profile backup:", bak);
  } else {
    log("would remove dependency + bundles entry + node_modules link");
  }
  log("restart DSH to take effect.");
  process.exit(0);
}

// ---- install ----
// 1) stage package into ~/.dsh/_plugins/dsh-subagent-fold
const FILES = ["package.json", "cordis.patch.yml", "lib", "tools", "LICENSE", "README.md"];
if (!DRY) {
  fs.rmSync(EXT, { recursive: true, force: true });
  fs.mkdirSync(EXT, { recursive: true });
  for (const f of FILES) {
    const s = path.join(REPO, f);
    if (fs.existsSync(s)) fs.cpSync(s, path.join(EXT, f), { recursive: true });
  }
  log("staged ->", EXT);
} else {
  log("would stage ->", EXT);
}

// 2) profile dependency + bundles + junction
pj.dependencies[NAME] = "link:" + EXT;
if (!pj.dsh.profile.bundles.includes(NAME)) pj.dsh.profile.bundles.push(NAME);

if (!DRY) {
  const bak = pjPath + ".bak-" + Date.now();
  fs.copyFileSync(pjPath, bak);
  fs.writeFileSync(pjPath, JSON.stringify(pj, null, 2) + "\n", "utf8");
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  try { fs.rmSync(linkPath, { recursive: true, force: true }); } catch (e) {}
  fs.symlinkSync(EXT, linkPath, "junction");
  log("profile updated:", pjPath, "(backup", bak + ")");
  log("junction:", linkPath, "->", EXT);
} else {
  log("would add dependency", NAME, "= link:" + EXT);
  log("would add to dsh.profile.bundles");
  log("would create junction", linkPath);
}

log("NOW: fully quit DSH and reopen once (not just Ctrl+R).");
