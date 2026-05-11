# opencode-plugin-updater


[![npm version](https://img.shields.io/npm/v/opencode-plugin-updater)](https://www.npmjs.com/package/opencode-plugin-updater)
[![npm downloads](https://img.shields.io/npm/dm/opencode-plugin-updater)](https://www.npmjs.com/package/opencode-plugin-updater)
[![CI](https://github.com/intisy/opencode-plugin-updater/actions/workflows/publish.yml/badge.svg)](https://github.com/intisy/opencode-plugin-updater/actions/workflows/publish.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Auto-update plugin for [OpenCode](https://github.com/sst/opencode).

Reads `config/plugins.json`, clones/pulls each plugin repo, runs configured build steps, and copies the output to the plugin directory on every OpenCode startup.

## Features

- **Automatic updates on startup** — pulls latest code and rebuilds changed plugins in the background
- **Manual mode** — disable auto-update per plugin; update on demand via the `plugin_update` tool
- **`<creator>/<repo>` directory layout** — repos are stored under `repos/<github-user>/<repo-name>`, preventing name collisions
- **Initial clone for manual plugins** — even plugins with `autoUpdate: false` are cloned on first run so they are available immediately
- **Centralized config** — reads/writes `config/plugins.json` (auto-migrates from the legacy root location)
- **Centralized logs** — writes to `logs/plugin-updater.log` with automatic log rotation (keeps last 100 lines)
- **Dual-exec guard** — prevents running twice when OpenCode loads the plugin file more than once

## Installation

### Option A — npm (recommended)

Add the package to your `~/.config/opencode/opencode.json`:

```jsonc
{
  "plugins": ["opencode-plugin-updater@latest"]
}
```

Restart OpenCode. The plugin is loaded directly from npm — no cloning or building required.

### Option B — Manual bootstrap

1. Clone the repo:

```bash
mkdir -p ~/.config/opencode/repos/intisy/opencode-plugin-updater
git clone https://github.com/intisy/opencode-plugin-updater.git ~/.config/opencode/repos/intisy/opencode-plugin-updater
cp ~/.config/opencode/repos/intisy/opencode-plugin-updater/plugin-updater.js ~/.config/opencode/plugins/plugin-updater.js
```

2. Register the plugin in `~/.config/opencode/opencode.json`:

```jsonc
{
  "plugins": {
    "plugin-updater": "./plugins/plugin-updater.js"
  }
}
```

Restart OpenCode. The plugin will keep itself (and all other plugins) up to date automatically from then on.

## plugins.json Format

Create `~/.config/opencode/config/plugins.json` with an array of plugin entries:

```json
[
  {
    "name": "my-plugin",
    "url": "https://github.com/user/my-plugin.git",
    "install": ["bun", "install"],
    "build": ["bun", "run", "build"],
    "bundle": null,
    "output": "dist/plugin.js",
    "pluginFile": "my-plugin.js",
    "autoUpdate": true
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Plugin identifier (used as repo folder name) |
| `url` | string | Git clone URL |
| `install` | string[] \| null | Install command (e.g. `["bun", "install"]`) |
| `build` | string[] \| null | Build command (e.g. `["bun", "run", "build"]`) |
| `bundle` | string[] \| null | Bundle command (optional second build step) |
| `output` | string | Path to the built plugin file inside the repo |
| `pluginFile` | string | Filename to use in the `plugins/` directory |
| `autoUpdate` | boolean | Whether to auto-update on startup |

## Tools

| Tool | Description |
|------|-------------|
| `plugin_list` | List all managed plugins with status, commit, and update availability |
| `plugin_update` | Pull, rebuild, and deploy a single plugin (or all) |
| `plugin_auto_update` | Toggle auto-update for a specific plugin |

## License

MIT
