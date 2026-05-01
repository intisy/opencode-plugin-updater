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
