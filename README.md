# opencode-plugin-updater

Auto-update plugin for [OpenCode](https://github.com/sst/opencode).

Reads `plugins.json` from the config directory, clones/pulls each plugin repo, runs the configured build steps, and copies the output to the plugin directory on every OpenCode startup.

## Features

- **Automatic updates on startup** — pulls latest code and rebuilds changed plugins in the background
- **Manual mode** — disable auto-update per plugin; update on demand via the `plugin_update` tool
- **`<creator>/<repo>` directory layout** — repos are stored under `repos/<github-user>/<repo-name>`, preventing name collisions
- **Initial clone for manual plugins** — even plugins with `autoUpdate: false` are cloned on first run so they are available immediately
- **Centralized config** — reads/writes `config/plugins.json` (auto-migrates from the legacy root location)
- **Centralized logs** — writes to `logs/plugin-updater.log` with automatic log rotation (keeps last 100 lines)
- **Dual-exec guard** — prevents running twice when OpenCode loads the plugin file more than once

## Installation

### 1. Add the plugin entry

Add the following object to the array in `~/.config/opencode/config/plugins.json` (create the file if it doesn't exist):

```json
{
  "name": "opencode-plugin-updater",
  "url": "https://github.com/intisy/opencode-plugin-updater.git",
  "install": null,
  "build": null,
  "bundle": null,
  "output": "plugin-updater.js",
  "pluginFile": "plugin-updater.js",
  "autoUpdate": true
}
```

### 2. Register the plugin in OpenCode

Add an entry to `~/.config/opencode/opencode.json` under the `plugins` key:

```jsonc
{
  "plugins": {
    "plugin-updater": "./plugins/plugin-updater.js"
    // ...other plugins
  }
}
```

### 3. Bootstrap (first time only)

Clone the repo and copy the plugin file manually:

```bash
mkdir -p ~/.config/opencode/repos/intisy/opencode-plugin-updater
git clone https://github.com/intisy/opencode-plugin-updater.git ~/.config/opencode/repos/intisy/opencode-plugin-updater
cp ~/.config/opencode/repos/intisy/opencode-plugin-updater/plugin-updater.js ~/.config/opencode/plugins/plugin-updater.js
```

After the first manual setup, restart OpenCode. The plugin will keep itself (and all other plugins) up to date automatically from then on.

## plugins.json Format

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
| `output` | string | Path to the built file, relative to the repo root |
| `pluginFile` | string | Filename in the `plugins/` directory |
| `autoUpdate` | boolean | Whether to update automatically on startup |

## Exposed Tools

| Tool | Description |
|------|-------------|
| `plugin_list` | List all plugins with status, commit, and update availability |
| `plugin_update` | Update a single plugin by name, or all plugins at once |
| `plugin_auto_update` | Toggle auto-update on/off for a specific plugin |

## Publishing (maintainer)

This package auto-publishes to npm when a version tag is pushed:

```bash
npm version patch   # or minor / major
git push && git push --tags
```

A GitHub Actions workflow handles the rest. The `NPM_TOKEN` secret must be configured in the repository settings.

## License

MIT
