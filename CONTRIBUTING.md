# Contributing

Herdr plugins are ordinary directories with a manifest, and Herdr skills are
ordinary Markdown files. That keeps contribution rules short.

## Before you start

```bash
herdr --version          # 0.7.0+ required
herdr plugin --help      # the installed binary is the authority on syntax
make validate
```

Read [docs/herdr-reference.md](docs/herdr-reference.md) for manifest fields,
injected environment variables, action contexts, and event names.

## Add a plugin

1. Create `plugins/<name>/` with `herdr-plugin.toml`, `README.md`, and your
   scripts or program.
2. Pick an id in this repo's namespace: `herdr-config.<name>`. Local action, pane,
   and link-handler ids may not contain dots.
3. Set `min_herdr_version` to the oldest Herdr that supports what you actually
   use.
4. Declare `platforms` at the top level, and per-entrypoint when an entrypoint
   cannot run everywhere.
5. Write `README.md` so a stranger can review what runs before installing:
   install command, every entrypoint, config file, and the Herdr calls it makes.
6. `chmod +x` entrypoint scripts and give them a shebang.
7. `make validate` must pass with zero errors.
8. If the plugin contains logic worth testing, ship the tests next to it and make
   `make test` pass. `plugins/pane-name` is the pattern: pure logic in one module,
   I/O behind a one-method interface, tests driving the logic directly.

CI runs `python3 scripts/validate.py --strict`, `npm test` in every plugin
directory that has a `package.json`, `tsc --noEmit` for every plugin with a
`tsconfig.json`, and a rebuild that fails if a committed `dist/` no longer matches
`src/`.

TypeScript plugins run from committed build output, not from source: Herdr runs
plugin commands with the `node` on its own `PATH`, and that Node may be too old to
execute `.ts`. Keep `src/`, keep the source erasable-only (no enums, no parameter
properties), keep runtime dependencies at zero, run `make build`, and commit the
`dist/` it writes. CI rebuilds and fails if your `dist/` is stale.

## Add a skill

1. Create `skills/<name>/SKILL.md` where `<name>` matches the frontmatter `name`.
2. Frontmatter: `name` plus a `description` that says what it does **and** when a
   user would ask for it, in their words.
3. Start the body with the `HERDR_ENV=1` guardrail and an explicit "stop here" if
   it fails.
4. Document failure modes, not just the happy path.
5. One job per skill. If a skill needs another skill, link it.
6. Try it for real: `make install-skills` copies it into `~/.agents/skills` and
   symlinks it into `~/.claude/skills` (and `~/.codex/skills` if present), then
   restart the agent session and check it triggers on the phrasing you wrote in
   the description.

## Rules that keep plugins reviewable

- **Commands are argv arrays.** Never `["sh", "-c", "..."]` with interpolated
  user input.
- **Call Herdr through `HERDR_BIN_PATH`.** Hardcoded `herdr` breaks when the
  binary is elsewhere; the raw socket transport differs between Unix sockets and
  Windows named pipes.
- **Never write config or state inside the plugin directory.** GitHub installs are
  managed checkouts that a reinstall replaces. Use `HERDR_PLUGIN_CONFIG_DIR` for
  user-editable config and `HERDR_PLUGIN_STATE_DIR` for state.
- **Read identifiers from JSON responses.** `.result.pane.pane_id`, not guesses.
  After `pane move`, the old id is not a general target.
- **Do not touch panes you did not create.** Track the ids you opened and close
  only those.
- **No secrets in the repo or in state files.** Document that credentials belong in
  `HERDR_PLUGIN_CONFIG_DIR`, which is outside git.
- **Prefer no build step.** Bash, a single Node file, or a static binary install
  without a toolchain. `[[build]]` runs only on GitHub install and Herdr does not
  install missing toolchains for you.
- **Degrade on unknown payloads.** Event payload shapes are not a stable public
  contract; read fields with fallbacks and treat a missing field as a no-op.

## Testing a plugin

```bash
herdr plugin link ./plugins/<name>
herdr plugin action list --plugin herdr-config.<name>
herdr plugin action invoke herdr-config.<name>.<action>
herdr plugin log list --plugin herdr-config.<name>
herdr plugin unlink herdr-config.<name>
```

For layout or agent plugins, test in a scratch workspace so you do not disturb a
live one:

```bash
herdr workspace create --label plugin-test --no-focus
# run the plugin against that workspace, then:
herdr workspace close <workspace_id>
```

`plugin link` does not copy files or run build commands, so edits apply on the
next invocation.

## Pull requests

- One plugin or one skill per PR.
- Say which Herdr version you tested on and which platforms.
- Include the output of `make validate`.
- If you added a plugin, the README must state every command Herdr will run.

Issues are welcome for plugin ideas, broken behaviour, and Herdr version drift in
this repo's reference notes.
