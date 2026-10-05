# Plugins

One directory per plugin. Each directory is a self-contained, separately
installable Herdr plugin with its own `herdr-plugin.toml`.

```text
plugins/
└── pane-name/
    ├── herdr-plugin.toml
    ├── README.md
    ├── bin/pane-name          CLI shim
    ├── src/*.ts               resolver, Herdr seam, actions, CLI
    ├── dist/*.js              compiled output, committed: what Herdr runs
    └── tests/*.test.ts        32 unit tests + fixtures
```

`pane-name/` is written in TypeScript, so it also carries `package.json` and two
`tsconfig.json` files. It has **no runtime dependencies**. The manifest points at
`dist/cli.js` rather than `src/cli.ts` because Herdr runs plugin commands with the
`node` on its own `PATH`, which may be too old to execute TypeScript.

## Install any of them

```bash
herdr plugin install lulogix/herdr-config/plugins/<dir> --yes
herdr plugin list
herdr plugin action list --plugin <plugin-id>
herdr plugin log list --plugin <plugin-id>
```

`owner/repo/subdir` is the GitHub shorthand `plugin install` accepts. Add more
path segments for deeper nesting.

## Develop against a local checkout

```bash
herdr plugin link ./plugins/pane-name       # no build step, no copy
herdr plugin action invoke herdr-config.pane-name.list-names
herdr plugin unlink herdr-config.pane-name   # unregister, keep files
```

`plugin link` points Herdr at your working tree, so the next invocation picks up
your edits. Build commands declared in `[[build]]` run only on GitHub installs.

Enabled state and registration are global to your user, shared by every session.

## Conventions used here

- **Id namespace**: `herdr-config.<name>`. Qualified action ids become
  `herdr-config.<name>.<action>`, which stays unambiguous even across plugins.
- **No config or state in the plugin directory.** GitHub installs are managed
  checkouts that a reinstall replaces. User-editable config goes in
  `HERDR_PLUGIN_CONFIG_DIR`, runtime state in `HERDR_PLUGIN_STATE_DIR`.
- **Commands are argv arrays**, never shell strings. No shell expansion happens
  unless the command starts a shell itself.
- **Call Herdr through `HERDR_BIN_PATH`**, not a hardcoded `herdr`, and not the
  raw socket: the transport behind `HERDR_SOCKET_PATH` is a Unix socket on
  Linux/macOS and a named pipe on Windows.
- **Read identifiers from JSON responses** instead of predicting them, e.g.
  `.result.pane.pane_id` after `pane split`.
- **Entrypoint scripts are executable** and start with the right shebang.
- **`min_herdr_version` is the oldest Herdr that actually supports what the
  manifest uses**, not the version you developed on.

See [docs/herdr-reference.md](../docs/herdr-reference.md) for manifest fields,
injected environment variables, action contexts, and event names.
