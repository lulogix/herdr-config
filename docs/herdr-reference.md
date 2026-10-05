# Herdr plugin and skill reference

A condensed, version-checked cheat sheet for everything the plugins in this repo
depend on. Verified against **Herdr 0.9.3**. When this file and the installed
binary disagree, the binary wins: run `herdr <group>` with no subcommand.

## Manifest (`herdr-plugin.toml`)

Required top-level keys: `id`, `name`, `version`, `min_herdr_version`.
Optional: `description`, `platforms`.

```toml
id = "herdr-config.pane-name"           # ASCII letters, digits, . : _ -
name = "Pane Name"
version = "0.1.0"
min_herdr_version = "0.7.0"            # oldest Herdr that supports what you use
description = "..."
platforms = ["linux", "macos", "windows"]
```

- `min_herdr_version` blocks `plugin install` and `plugin link` when it is newer
  than the installed binary. Set it to what your manifest actually uses, not what
  you developed on.
- Local plugins with **no** top-level `platforms` link with a warning.
- Item-level `platforms` override the top-level list.
- Local ids (action, pane, link handler) may use letters, digits, `:`, `_`, `-`
  but **not dots**. Plugin ids may contain dots. Herdr qualifies actions as
  `plugin.id.action`.
- `command` is always an **argv array**. No shell, no expansion, no globbing
  unless the command starts a shell itself.

### Entrypoint blocks

| Block | Purpose | Key fields |
| --- | --- | --- |
| `[[actions]]` | invokable command, keybindable | `id`, `title`, `contexts`, `command`, `description`, `platforms` |
| `[[startup]]` | one-shot init after session restore + socket ready | `command`, `platforms` |
| `[[events]]` | run on a Herdr event | `on`, `command`, `platforms` |
| `[[panes]]` | Herdr-managed terminal | `id`, `title`, `placement`, `width`, `height`, `command`, `platforms` |
| `[[link_handlers]]` | route Ctrl-clicked URLs to an action | `id`, `title`, `pattern`, `action` |
| `[[build]]` | runs only during GitHub `plugin install` | `command`, `platforms` |

Action `contexts`: `global`, `workspace`, `tab`, `pane`, `selection`.

Pane `placement`: `overlay` (default), `popup`, `split`, `tab`, `zoomed`.
`width` / `height` accept terminal cells or percentage strings such as `"80%"`.

`link_handlers.pattern` is a **Rust regular expression** matched against the
clicked URL; handlers are checked in manifest order. The click modifier is
**Control on every platform, including macOS**.

## Injected environment

Available to runtime commands (actions, startup, event hooks, panes). Commands run
with the plugin directory as their working directory.

| Variable | Contents |
| --- | --- |
| `HERDR_ENV` | `1` inside Herdr-managed processes |
| `HERDR_BIN_PATH` | path to the running Herdr binary — the portable way to call Herdr |
| `HERDR_SOCKET_PATH` | Unix socket path, or Windows named pipe |
| `HERDR_PLUGIN_ID` | plugin id |
| `HERDR_PLUGIN_ROOT` | installed or linked plugin directory (never store state here) |
| `HERDR_PLUGIN_CONFIG_DIR` | user-editable config, e.g. `.env` |
| `HERDR_PLUGIN_STATE_DIR` | local runtime state |
| `HERDR_PLUGIN_CONTEXT_JSON` | workspace/tab/focused pane/worktree/agent/selection/URL context |
| `HERDR_WORKSPACE_ID` / `HERDR_TAB_ID` / `HERDR_PANE_ID` | caller context when available |
| `HERDR_PLUGIN_ACTION_ID` | action commands only |
| `HERDR_PLUGIN_EVENT` | startup and event hooks (`startup` for startup hooks) |
| `HERDR_PLUGIN_EVENT_JSON` | event hooks only |
| `HERDR_PLUGIN_ENTRYPOINT_ID` | pane commands only |
| `HERDR_PLUGIN_CLICKED_URL`, `HERDR_PLUGIN_LINK_HANDLER_ID` | link-handler invocations |

`HERDR_PLUGIN_CONTEXT_JSON` fields seen in 0.9.3: `workspace_id`,
`workspace_label`, `workspace_cwd`, `tab_id`, `tab_label`, `focused_pane_id`,
`focused_pane_agent`, `focused_pane_cwd`, `focused_pane_status`, `worktree`,
`selected_text`, `clicked_url`, `link_handler_id`, `invocation_source`,
`correlation_id`. Treat the shape as version-dependent: read the individual env
vars for common ids and parse the JSON only for the rest.

**Event payloads are an envelope, not a flat object.** Verified on 0.9.3:

```json
{"event": "pane_agent_status_changed",
 "data": {"type": "pane_agent_status_changed", "pane_id": "w1:p1",
          "workspace_id": "w1", "agent_status": "done", "agent": "pi"}}
```

Read fields under `.data` first, then fall back to the flat spelling.

**Where the ids come from for an action invoked from the CLI.** Herdr resolves the
server's focused pane and injects it: `invocation_source: "cli"`,
`HERDR_PANE_ID` / `HERDR_TAB_ID` / `HERDR_WORKSPACE_ID` set to the focused pane,
which is usually **not** the pane your shell runs in. Focus the intended workspace
first, or invoke the action from a keybinding inside the pane you want.

**Real paths on this machine (Herdr 0.9.3, macOS).**

```text
config: ~/.config/herdr/plugins/config/<plugin-id>
state:  ~/.local/state/herdr/plugins/<plugin-id>
```

`plugin action invoke` is asynchronous: the response carries a log record with
`status: "running"`, and stdout/stderr appear in `plugin log list` shortly after.

Build commands get **no** runtime plugin context and no socket env.

**Plugin commands run under the `node` on the Herdr server's PATH, not yours.**
On this machine that resolved to Node 20.20.2 while the interactive shell had
25.9.0. Node 20 cannot execute `.ts` files, so a manifest that says
`command = ["node", "src/cli.ts"]` fails with `ERR_UNKNOWN_FILE_EXTENSION` in
`herdr plugin log list` while working perfectly when you run it by hand.
`plugins/pane-name` commits its compiled `dist/` and points the manifest at
`dist/cli.js` for that reason. Bash entrypoints do not have this problem.

## Storage

There is no Herdr-managed plugin storage API in plugin v1. Own your files. The
rule this repo follows:

- `HERDR_PLUGIN_CONFIG_DIR` → user-editable, survives reinstalls.
- `HERDR_PLUGIN_STATE_DIR` → runtime state, plugin-owned format.
- `HERDR_PLUGIN_ROOT` → source only. GitHub installs are managed checkouts that a
  reinstall replaces.

## Keybindings

```toml
[[keys.command]]
key = "prefix+alt+l"
type = "plugin_action"
command = "herdr-config.pane-name.list-names"
description = "list pane names"
```

`type` also accepts `shell` (detached), `pane` (temporary pane), and `popup`
(session-modal terminal, optional `width` / `height`). `plugin_action` bindings can
only invoke a manifest action; opening a pane entrypoint requires the CLI, so bind
a `shell` command that calls `herdr plugin pane open`.

Apply changes without restarting: `herdr server reload-config`, then
`herdr config check`.

Default prefix is `ctrl+b`. Taken by default include `prefix+l`, `prefix+g`,
`prefix+shift+g`, `prefix+c`, `prefix+n`, `prefix+w`, `prefix+z`, `prefix+x`,
`prefix+q`. Prefer function keys or explicit chords for direct bindings.

## Plugin CLI

```bash
herdr plugin install <owner>/<repo>[/subdir...] [--ref REF] [--yes]
herdr plugin list [--plugin ID] [--json]
herdr plugin enable <id> ; herdr plugin disable <id>
herdr plugin link <path> [--disabled] ; herdr plugin unlink <id>
herdr plugin uninstall <id|owner/repo[/subdir...]>
herdr plugin config-dir <id>
herdr plugin action list [--plugin ID]
herdr plugin action invoke <plugin.id.action> [--plugin ID]
herdr plugin log list [--plugin ID] [--limit N]
herdr plugin pane open --plugin ID --entrypoint ID [--placement ...] [--width S] [--height S]
herdr plugin pane focus <pane_id> ; herdr plugin pane close <pane_id>
```

`plugin pane open` verified on 0.9.3: `--placement split` requires `--target-pane
<pane_id>`, and passing `--workspace` **together with** `--target-pane` is rejected
with `invalid_params: split and zoomed plugin panes target an existing pane`.
Omit `--placement` to get the manifest's own placement. The opened pane reports
`cwd` = the plugin directory, so manifest commands may use paths relative to it.

No `plugin update` in v1: reinstall from GitHub. Installing over a locally linked
plugin is refused — unlink first.

## Event names used by `[[events]] on = ...`

Lifecycle events Herdr emits, as present in the 0.9.3 build:

| Group | Events |
| --- | --- |
| workspace | `workspace.created`, `workspace.closed`, `workspace.focused`, `workspace.moved`, `workspace.renamed`, `workspace.reordered`, `workspace.updated`, `workspace.metadata_updated` |
| tab | `tab.created`, `tab.closed`, `tab.focused`, `tab.moved`, `tab.renamed` |
| pane | `pane.created`, `pane.closed`, `pane.exited`, `pane.focused`, `pane.moved`, `pane.updated`, `pane.scroll_changed`, `pane.agent_detected`, `pane.agent_status_changed`, `pane.output_matched` |
| worktree | `worktree.created`, `worktree.opened`, `worktree.removed` |
| server | `server.connected`, `server.live_handoff` |
| plugin | `plugin.linked`, `plugin.unlinked`, `plugin.enabled`, `plugin.disabled`, `plugin.pane.opened`, `plugin.pane.closed`, `plugin.pane.focused`, `plugin.action_invoked`, `plugin.action_list`, `plugin_list`, `plugin_log_list` |

Event payloads are not a stable public contract across versions. Read fields with
fallbacks and treat a missing payload as a no-op.

## CLI map plugins lean on

```bash
herdr workspace list
herdr tab create [--workspace ID] [--cwd PATH] [--label TEXT] [--focus|--no-focus]
herdr pane split [--pane ID|--current] --direction right|down [--ratio F] [--cwd PATH] [--env K=V]
herdr pane run <pane_id> <command>              # submits text + Enter atomically
herdr pane read <pane_id> --source visible|recent|recent-unwrapped|detection [--lines N]
herdr pane wait-output <pane_id> (--match TEXT | --regex PATTERN) [--timeout MS]
herdr pane close <pane_id>
herdr agent start <name> --kind KIND --pane ID [-- <agent args...>]
herdr agent prompt <name> <text> [--wait] [--until STATUS]... [--timeout MS]
herdr agent wait <name> [--until STATUS]... [--timeout MS]
herdr agent list ; herdr agent get <target> ; herdr agent read <target>
herdr notification show <title> [--body TEXT] [--position ...] [--sound none|done|request]
herdr server reload-config ; herdr config check
```

`pane run` beats `send-text` + `send-keys Enter`. `agent prompt --wait` beats a
separate prompt and wait.

## Marketplace listing

- Add the GitHub topic `herdr-plugin` to a **public** repository.
- Keep at least one `herdr-plugin.toml` with parseable required metadata at the
  root or in a subdirectory of the **default branch**.
- One repository card lists every valid manifest as a separately installable
  plugin. Forks, archived repos, and malformed manifests are excluded.
- The index refreshes every 30 minutes and rescans on default-branch head change.
- Listing means the repository tagged itself. It is not a security review.

## Skills

- `skills/<name>/SKILL.md`, frontmatter `name` + `description`.
- `npx skills add <owner>/<repo> --skill <name> [-g]`.
- The upstream skill is `npx skills add herdrdev/herdr --skill herdr -g`, and
  `herdr --skill` prints the copy bundled with your binary.
- Two upstream documents exist for different jobs: the **skill** teaches an agent
  to operate Herdr; `herdr.dev/agent-guide.md` teaches an agent to help a human
  set up or troubleshoot Herdr.

## Sources

- Herdr docs index: `https://herdr.dev/llms.txt`
- Plugins: `docs/next/website/src/content/docs/plugins.mdx`
- Marketplace: `docs/next/website/src/content/docs/marketplace.mdx`
- CLI reference: `docs/next/website/src/content/docs/cli-reference.mdx`
- Socket API: `docs/next/website/src/content/docs/socket-api.mdx`
- Config reference JSON: `docs/next/website/src/data/config-reference.json`

Fetch the revision matching your installed version:

```bash
v=$(herdr --version | awk '{print $2}')
curl -fsSL "https://raw.githubusercontent.com/herdrdev/herdr/v${v}/docs/next/website/src/content/docs/plugins.mdx"
```
