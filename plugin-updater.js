import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

var CONFIG_DIR = join(import.meta.dir, "..");
var REPOS_DIR = join(CONFIG_DIR, "repos");
var PLUGIN_DIR = join(import.meta.dir);
var LOG_FILE = join(CONFIG_DIR, "plugin-updater.log");

var PLUGINS_JSON = join(CONFIG_DIR, "plugins.json");
var REPOS = [];
try {
  if (existsSync(PLUGINS_JSON)) {
    REPOS = JSON.parse(readFileSync(PLUGINS_JSON, "utf-8"));
  }
} catch (e) {}

function ts() {
  var d = new Date();
  return d.toISOString().replace("T", " ").substring(0, 19);
}

function log(msg) {
  try {
    var line = "[" + ts() + "] " + msg + "\n";
    var prev = "";
    try { prev = readFileSync(LOG_FILE, "utf-8"); } catch {}
    var lines = prev.split("\n");
    if (lines.length > 200) lines = lines.slice(-100);
    writeFileSync(LOG_FILE, lines.join("\n") + line, "utf-8");
  } catch {}
}

async function run(cmd, cwd, label) {
  try {
    var proc = Bun.spawn(cmd, {
      cwd: cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    var code = await proc.exited;
    if (code !== 0) {
      var errText = "";
      try { errText = await new Response(proc.stderr).text(); } catch {}
      log(label + " FAILED (exit " + code + "): " + errText.substring(0, 200));
    } else {
      log(label + " OK");
    }
    return code === 0;
  } catch (e) {
    log(label + " ERROR: " + (e.message || e));
    return false;
  }
}

async function getRemote(dir) {
  try {
    var proc = Bun.spawn(["git", "remote", "get-url", "origin"], {
      cwd: dir,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
    });
    await proc.exited;
    var url = await new Response(proc.stdout).text();
    return url.trim();
  } catch {
    return "";
  }
}

async function getLocalHead(dir) {
  try {
    var proc = Bun.spawn(["git", "rev-parse", "HEAD"], {
      cwd: dir, stdin: "ignore", stdout: "pipe", stderr: "ignore",
    });
    await proc.exited;
    return (await new Response(proc.stdout).text()).trim();
  } catch { return ""; }
}

async function updateRepo(repo) {
  var dir = join(REPOS_DIR, repo.name);
  log("--- " + repo.name + " ---");

  if (!existsSync(dir)) {
    log("Cloning " + repo.url);
    if (!await run(["git", "clone", repo.url, repo.name], REPOS_DIR, "git clone " + repo.name)) return false;
  } else {
    var currentUrl = await getRemote(dir);
    if (currentUrl && currentUrl !== repo.url && currentUrl !== repo.url.replace(".git", "")) {
      log("Remote mismatch: " + currentUrl + " -> " + repo.url);
      await run(["git", "remote", "set-url", "origin", repo.url], dir, "set-url");
    }
  }

  var headBefore = await getLocalHead(dir);

  await run(["git", "fetch", "origin"], dir, "git fetch");
  await run(["git", "pull", "--ff-only"], dir, "git pull");

  var headAfter = await getLocalHead(dir);
  var changed = headBefore !== headAfter;

  var outputPath = join(dir, repo.output);
  var destPath = join(PLUGIN_DIR, repo.pluginFile);
  var needsBuild = changed || !existsSync(outputPath) || !existsSync(destPath);

  if (!needsBuild) {
    log("No changes, skipping build");
    return true;
  }

  log("Building (changed=" + changed + ")");

  if (!await run(repo.install, dir, "install")) return false;
  if (!await run(repo.build, dir, "build")) return false;

  if (repo.bundle) {
    if (!await run(repo.bundle, dir, "bundle")) return false;
  }

  if (existsSync(outputPath)) {
    try {
      copyFileSync(outputPath, destPath);
      log("Copied " + repo.output + " -> " + repo.pluginFile);
    } catch (e) {
      log("Copy failed: " + (e.message || e));
      return false;
    }
  } else {
    log("Output not found: " + outputPath);
    return false;
  }

  return true;
}

async function updateAll() {
  log("=== Plugin updater started ===");

  if (!existsSync(REPOS_DIR)) {
    try { mkdirSync(REPOS_DIR, { recursive: true }); } catch {}
  }

  for (var repo of REPOS) {
    try {
      await updateRepo(repo);
    } catch (e) {
      log(repo.name + " unexpected error: " + (e.message || e));
    }
  }

  log("=== Plugin updater finished ===");
}

updateAll().catch(function() {});
