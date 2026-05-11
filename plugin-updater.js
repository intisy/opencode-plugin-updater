import { tool } from "@opencode-ai/plugin";
import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "fs";
import { join, dirname } from "path";

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

function findConfigDir(start) {
  var dir = start;
  for (var i = 0; i < 5; i++) {
    if (existsSync(join(dir, "opencode.json"))) return dir;
    if (existsSync(join(dir, "config", "plugins.json"))) return dir;
    if (existsSync(join(dir, "plugins.json"))) return dir;
    var parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirname(start);
}

var CONFIG_DIR = findConfigDir(import.meta.dir);
var LOGS_DIR = join(CONFIG_DIR, "logs");
var CONFIG_FOLDER = join(CONFIG_DIR, "config");
var REPOS_DIR = join(CONFIG_DIR, "repos");
var PLUGINS_DIR = join(CONFIG_DIR, "plugin");
var LOG_FILE = join(LOGS_DIR, "plugin-updater.log");
var PLUGINS_JSON = join(CONFIG_FOLDER, "plugins.json");

// ---------------------------------------------------------------------------
// Migration: move legacy files to new locations
// ---------------------------------------------------------------------------

function migrateToNewPaths() {
  if (!existsSync(LOGS_DIR)) try { mkdirSync(LOGS_DIR, { recursive: true }); } catch {}
  if (!existsSync(CONFIG_FOLDER)) try { mkdirSync(CONFIG_FOLDER, { recursive: true }); } catch {}

  // Migrate plugins.json from root to config/
  var legacyPluginsJson = join(CONFIG_DIR, "plugins.json");
  if (existsSync(legacyPluginsJson) && !existsSync(PLUGINS_JSON)) {
    try { copyFileSync(legacyPluginsJson, PLUGINS_JSON); } catch {}
  }

  // Migrate plugin-updater.log from root to logs/
  var legacyLog = join(CONFIG_DIR, "plugin-updater.log");
  if (existsSync(legacyLog) && !existsSync(LOG_FILE)) {
    try { renameSync(legacyLog, LOG_FILE); } catch {}
  }
}

migrateToNewPaths();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadPlugins() {
  try {
    if (existsSync(PLUGINS_JSON)) return JSON.parse(readFileSync(PLUGINS_JSON, "utf-8"));
    var legacy = join(CONFIG_DIR, "plugins.json");
    if (existsSync(legacy)) return JSON.parse(readFileSync(legacy, "utf-8"));
  } catch {}
  return [];
}

function savePlugins(plugins) {
  if (!existsSync(CONFIG_FOLDER)) try { mkdirSync(CONFIG_FOLDER, { recursive: true }); } catch {}
  writeFileSync(PLUGINS_JSON, JSON.stringify(plugins, null, 2), "utf-8");
}

function ts() {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

function log(msg) {
  try {
    if (!existsSync(LOGS_DIR)) try { mkdirSync(LOGS_DIR, { recursive: true }); } catch {}
    var line = "[" + ts() + "] " + msg + "\n";
    var prev = "";
    try { prev = readFileSync(LOG_FILE, "utf-8"); } catch {}
    var lines = prev.split("\n");
    if (lines.length > 200) lines = lines.slice(-100);
    writeFileSync(LOG_FILE, lines.join("\n") + line, "utf-8");
  } catch {}
}

async function run(cmd, cwd, label) {
  if (!cmd) { log(label + " skipped (null)"); return true; }
  try {
    var proc = Bun.spawn(cmd, { cwd: cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
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

async function gitText(args, cwd) {
  try {
    var proc = Bun.spawn(args, { cwd: cwd, stdin: "ignore", stdout: "pipe", stderr: "ignore" });
    await proc.exited;
    return (await new Response(proc.stdout).text()).trim();
  } catch { return ""; }
}

async function getLocalHead(dir) {
  return gitText(["git", "rev-parse", "HEAD"], dir);
}

async function getRemoteHead(dir) {
  for (var ref of ["origin/HEAD", "origin/main", "origin/master"]) {
    var h = await gitText(["git", "rev-parse", ref], dir);
    if (h) return h;
  }
  return "";
}

async function getLastCommitSubject(dir) {
  return gitText(["git", "log", "-1", "--format=%s"], dir);
}

// ---------------------------------------------------------------------------
// Core update logic
// ---------------------------------------------------------------------------

function getFolderName(repo) {
  var match = (repo.url || "").match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
  if (match) return match[1] + "/" + repo.name;
  return repo.name;
}

async function ensureCloned(repo) {
  var folderName = getFolderName(repo);
  var dir = join(REPOS_DIR, folderName);

  if (existsSync(dir)) return dir;

  var parentDir = dirname(dir);
  if (!existsSync(parentDir)) {
    try { mkdirSync(parentDir, { recursive: true }); } catch(e){}
  }
  log("Cloning " + repo.url + " -> " + folderName);
  var cloneArgs = repo.branch
      ? ["git", "clone", "--branch", repo.branch, repo.url, folderName]
      : ["git", "clone", repo.url, folderName];
    if (!await run(cloneArgs, REPOS_DIR, "git clone " + folderName)) {
      return null;
    }

  if (repo.install) await run(repo.install, dir, "install");
  if (repo.build) await run(repo.build, dir, "build");
  if (repo.bundle) await run(repo.bundle, dir, "bundle");
  var outputPath = join(dir, repo.output);
  var destPath = join(PLUGINS_DIR, repo.pluginFile);
  if (existsSync(outputPath)) {
    try { copyFileSync(outputPath, destPath); log("Copied " + repo.output + " -> " + repo.pluginFile); } catch(e){}
  }

  return dir;
}

async function updateRepo(repo) {
  var folderName = getFolderName(repo);
  var dir = join(REPOS_DIR, folderName);

  log("--- " + folderName + " ---");

  if (!existsSync(dir)) {
    var clonedDir = await ensureCloned(repo);
    if (!clonedDir) return { success: false, error: "Clone failed" };
    var head = await getLocalHead(clonedDir);
    return { success: true, changed: true, commit: head };
  }

  var currentUrl = await gitText(["git", "remote", "get-url", "origin"], dir);
  if (currentUrl && currentUrl !== repo.url && currentUrl !== repo.url.replace(".git", "")) {
    await run(["git", "remote", "set-url", "origin", repo.url], dir, "set-url");
  }

  var headBefore = await getLocalHead(dir);
  await run(["git", "fetch", "origin"], dir, "git fetch");
  if (repo.branch) {
      await run(["git", "checkout", repo.branch], dir, "git checkout");
      await run(["git", "pull", "--ff-only", "origin", repo.branch], dir, "git pull");
    } else {
      await run(["git", "pull", "--ff-only"], dir, "git pull");
    }
  var headAfter = await getLocalHead(dir);
  var changed = headBefore !== headAfter;

  var outputPath = join(dir, repo.output);
  var destPath = join(PLUGINS_DIR, repo.pluginFile);
  var needsBuild = changed || !existsSync(outputPath) || !existsSync(destPath);

  if (!needsBuild) {
    log("No changes, skipping build");
    return { success: true, changed: false, commit: headAfter };
  }

  log("Building (changed=" + changed + ")");
  if (repo.install && !await run(repo.install, dir, "install")) return { success: false, error: "Install failed" };
  if (repo.build && !await run(repo.build, dir, "build")) return { success: false, error: "Build failed" };
  if (repo.bundle && !await run(repo.bundle, dir, "bundle")) return { success: false, error: "Bundle failed" };

  if (existsSync(outputPath)) {
    try {
      copyFileSync(outputPath, destPath);
      log("Copied " + repo.output + " -> " + repo.pluginFile);
    } catch (e) {
      return { success: false, error: "Copy failed: " + (e.message || e) };
    }
  } else {
    return { success: false, error: "Build output not found: " + repo.output };
  }
  return { success: true, changed: true, commit: headAfter };
}

async function updateAll(onlyAutoUpdate) {
  log("=== Plugin updater started (autoOnly=" + onlyAutoUpdate + ") ===");
  if (!existsSync(REPOS_DIR)) try { mkdirSync(REPOS_DIR, { recursive: true }); } catch {}
  if (!existsSync(PLUGINS_DIR)) try { mkdirSync(PLUGINS_DIR, { recursive: true }); } catch {}

  var plugins = loadPlugins();
  var results = [];

  for (var repo of plugins) {
    if (onlyAutoUpdate && repo.autoUpdate === false) {
          var manualFolder = getFolderName(repo);
          var manualDir = join(REPOS_DIR, manualFolder);
          if (!existsSync(manualDir)) {
            log("Initial clone for manual plugin: " + manualFolder);
            await ensureCloned(repo);
          } else {
            // Repo exists but plugin file may be missing (e.g. plugin/ dir was deleted)
            if (!existsSync(PLUGINS_DIR)) try { mkdirSync(PLUGINS_DIR, { recursive: true }); } catch {}
                    var manualDest = join(PLUGINS_DIR, repo.pluginFile);
            if (!existsSync(manualDest)) {
              var manualOutput = join(manualDir, repo.output);
              if (existsSync(manualOutput)) {
                try { copyFileSync(manualOutput, manualDest); log("Restored " + repo.pluginFile); } catch(e) {}
              } else {
                // Output missing too — need to rebuild
                if (repo.install) await run(repo.install, manualDir, "install");
                if (repo.build) await run(repo.build, manualDir, "build");
                if (repo.bundle) await run(repo.bundle, manualDir, "bundle");
                if (existsSync(manualOutput)) {
                  try { copyFileSync(manualOutput, manualDest); log("Rebuilt and restored " + repo.pluginFile); } catch(e) {}
                }
              }
            }
          }
          results.push({ name: repo.name, skipped: true, reason: "auto-update disabled" });
          continue;
        }
    try {
      var r = await updateRepo(repo);
      results.push({ name: repo.name, ...r });
    } catch (e) {
      log(repo.name + " unexpected error: " + (e.message || e));
      results.push({ name: repo.name, success: false, error: String(e.message || e) });
    }
  }

  log("=== Plugin updater finished ===");
  return results;
}

// ---------------------------------------------------------------------------
// Background auto-update on load (with guard against dual execution)
// ---------------------------------------------------------------------------

setTimeout(function () {
  if (globalThis.__pluginUpdaterAutoRan) return;
  globalThis.__pluginUpdaterAutoRan = true;
  updateAll(true).catch(function () {});
}, 0);

// ---------------------------------------------------------------------------
// OpenCode plugin export
// ---------------------------------------------------------------------------

export default async function PluginUpdater(ctx) {
  return {
    tool: {

      plugin_list: tool({
        description:
          "List all managed plugins with their status: auto-update setting, current local commit, whether an update is available, and deploy status.",
        args: {
          _placeholder: tool.schema.boolean().describe("Placeholder. Always pass true."),
        },
        async execute() {
          var plugins = loadPlugins();
          if (!plugins.length) return "No plugins configured in plugins.json.";

          var lines = [];
          for (var repo of plugins) {
            var dir = join(REPOS_DIR, getFolderName(repo));
            var autoUpdate = repo.autoUpdate !== false;
            var installed = existsSync(dir);
            var deployed = existsSync(join(PLUGINS_DIR, repo.pluginFile));
            var localHead = "";
            var remoteHead = "";
            var subject = "";
            var updateAvailable = false;

            if (installed) {
              await run(["git", "fetch", "origin"], dir, "fetch " + repo.name);
              localHead = await getLocalHead(dir);
              remoteHead = await getRemoteHead(dir);
              subject = await getLastCommitSubject(dir);
              updateAvailable = !!(localHead && remoteHead && localHead !== remoteHead);
            }

            var s = repo.name;
            s += "\n  Auto-update : " + (autoUpdate ? "on" : "OFF");
            s += "\n  Installed   : " + (installed ? "yes" : "no");
            s += "\n  Deployed    : " + (deployed ? "yes" : "no");
            if (localHead) s += "\n  Commit      : " + localHead.substring(0, 8) + " " + subject;
            if (updateAvailable) s += "\n  ** UPDATE AVAILABLE ** (remote " + remoteHead.substring(0, 8) + ")";
            s += "\n  Source      : " + repo.url;
            lines.push(s);
          }
          return lines.join("\n\n");
        },
      }),

      plugin_update: tool({
        description:
          "Update a specific plugin or all plugins. Pulls latest code from git, rebuilds if the plugin has build steps, and deploys the output to the plugins directory. A restart of OpenCode is required for changes to take effect.",
        args: {
          name: tool.schema
            .string()
            .optional()
            .describe("Name of a single plugin to update. Omit to update ALL plugins."),
        },
        async execute(args) {
          var plugins = loadPlugins();
          if (!plugins.length) return "No plugins configured in plugins.json.";

          if (args.name) {
            var repo = plugins.find(function (p) { return p.name === args.name; });
            if (!repo)
              return "Plugin not found: " + args.name + "\nAvailable: " + plugins.map(function (p) { return p.name; }).join(", ");

            var r = await updateRepo(repo);
            if (!r.success) return "FAILED to update " + args.name + ": " + r.error;
            if (!r.changed) return args.name + " is already up to date (commit " + (r.commit || "").substring(0, 8) + ").";
            return "Updated " + args.name + " to " + (r.commit || "").substring(0, 8) + ". Restart OpenCode to apply.";
          }

          var results = await updateAll(false);
          var out = results.map(function (r) {
            if (r.skipped) return r.name + ": skipped (" + r.reason + ")";
            if (!r.success) return r.name + ": FAILED (" + r.error + ")";
            if (!r.changed) return r.name + ": up to date";
            return r.name + ": updated -> " + (r.commit || "").substring(0, 8);
          });
          return out.join("\n") + "\n\nRestart OpenCode to apply changes.";
        },
      }),

      plugin_auto_update: tool({
        description:
          "Enable or disable automatic updates for a plugin. When disabled, the plugin will only be updated when you explicitly call the plugin_update tool. The setting is persisted to plugins.json.",
        args: {
          name: tool.schema.string().describe("Plugin name."),
          enabled: tool.schema.boolean().describe("true = enable auto-update, false = disable."),
        },
        async execute(args) {
          var plugins = loadPlugins();
          var repo = plugins.find(function (p) { return p.name === args.name; });
          if (!repo)
            return "Plugin not found: " + args.name + "\nAvailable: " + plugins.map(function (p) { return p.name; }).join(", ");

          repo.autoUpdate = args.enabled;
          savePlugins(plugins);
          return "Auto-update for " + args.name + " is now " + (args.enabled ? "ENABLED" : "DISABLED") + ".";
        },
      }),

    },
  };
}

export const server = PluginUpdater;
