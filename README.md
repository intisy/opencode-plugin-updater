# opencode-plugin-updater

Auto-update plugin for [OpenCode](https://github.com/sst/opencode).

Reads `plugins.json` from the config directory, clones/pulls each plugin repo, runs the build steps, and copies the output to the plugin directory on every OpenCode startup.

## Configuration

Create a `plugins.json` in your OpenCode config directory:

```json
[
  {
    "name": "my-plugin",
    "url": "https://github.com/user/my-plugin.git",
    "install": ["bun", "install"],
    "build": ["bun", "run", "build"],
    "bundle": null,
    "output": "dist/plugin.js",
    "pluginFile": "my-plugin.js"
  }
]
```


## Installation

To install this plugin, add the following entry to your `~/.config/opencode/plugins.json` array:

```json
{
  "name": "opencode-plugin-updater",
  "url": "https://github.com/intisy/opencode-plugin-updater.git",
  "pluginFile": "plugin-updater.js",
  "autoUpdate": true
}
```

*(Note: Depending on the plugin, you might also need `"install"`, `"build"`, or `"bundle"` commands defined in the JSON object if they require compilation. Consult the repository's source or standard OpenCode plugin docs for advanced builds. For basic usage, the updater handles the git clone automatically.)*

After adding it, restart OpenCode. The Plugin Updater will automatically clone and deploy it.
