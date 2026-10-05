# Pane Name

Address an agent by the name you gave it, not by `w1:p6`.

```bash
plugins/pane-name/bin/pane-name send reviewer "review the diff in src/auth.ts"
```

If the name refers to exactly one pane it sends. If it refers to more than one it
sends **nothing** and tells you which panes matched and why. That refusal is the
whole point: a wrong guess sends a prompt into someone else's agent.

## What a "name" is

Herdr already knows several names per pane. This plugin searches them in priority
order and stops at the first tier that matches anything.

| Tier | Matched against | Example |
| --- | --- | --- |
| `pane-id` | the query is exactly a pane id | `w1:p6` |
| `exact-name` | pane label (`herdr pane rename`), agent name (`herdr agent start <name>`) | `baymax-reviewer` |
| `partial-name` | substring of a pane label or agent name | `review` |
| `tab-name` | tab label, **only** for the single unnamed pane in that tab | `skyeye-agent` |
| `workspace-name` | workspace label, same single-unnamed-pane rule | `scratch` |
| `context` | terminal title, cwd basename, agent kind, display agent | `Build API refactor` |

Two rules that decide everything:

- **A pane id is never fuzzy-matched.** `w9:p9` reports "no pane with id w9:p9"
  rather than guessing at something similar.
- **A tab name only counts when the tab holds exactly one pane and that pane has
  no label of its own.** A tab named `extras` holding three panes is an ambiguity
  report, not a match, and it does not fall through to a weaker tier.

```
$ pane-name resolve reviewers
1 pane matches "reviewers" [tier: tab-name] - nothing was chosen:
  w1:p6    name=baymax-reviewer  agent=(unnamed)/pi  state=working  tab=reviewers  workspace=baymax  matched=reviewers via tab_label exact
      -> matched the tab name, but this pane is already named "baymax-reviewer"

Make it decisive:
  herdr pane rename <pane_id> <name>
  ... or narrow the search: --workspace <id|label> / --tab <id|label>
```

```
$ pane-name resolve skyeye-agent
unique: w1:p2  [tier: tab-name]
  w1:p2    name=(unnamed)  agent=(unnamed)/pi  state=idle  tab=skyeye-agent  workspace=baymax  matched=skyeye-agent via tab_label exact
```

## Commands

```bash
pane-name names                                  # every addressable name in the session
pane-name resolve <name>                         # who does this refer to?
pane-name send <name> <message...>               # prompt that pane
pane-name send <name> <message...> --wait        # wait for it to return to idle
pane-name send <name> <message...> --read 40     # then print 40 lines of its output
pane-name send <name> <command...> --cmd         # run a shell command instead of a prompt
pane-name rename <name> <label>                  # name a pane (or --clear)
pane-name picker                                 # interactive search-and-send
```

Every command takes `--json` (except `rename`/`picker`) and the narrowing filters
`--workspace <id|label>` and `--tab <id|label>`.

`send` picks the mechanism from what the pane hosts: an agent gets
`herdr agent prompt`, a plain shell pane gets `herdr pane run`.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | resolved and sent |
| 2 | bad arguments |
| 3 | **ambiguous - nothing was sent** |
| 4 | no pane matched |
| 5 | a Herdr call failed |

`3` is the code to branch on in scripts and agent tool calls.

## Naming panes is the other half

The resolver is only useful if panes have names. Two ways to get them:

```bash
herdr agent start reviewer --kind pi --pane w1:p6   # names the agent
herdr pane rename w1:p6 reviewer                    # names the pane
```

`pane-name names` shows what you have and what is still unnamed:

```
  pane     pane label             agent name         tab                workspace        state
  w1:p1    -                      -                  baymax-agent       baymax           idle
  w1:p3    konoha-agent           -                  baymax-agent       baymax           idle
  w1:p6    baymax-reviewer        -                  reviewers          baymax           working

6 pane(s): 3 named, 3 unnamed.
1 unnamed pane(s) are addressable by tab name; 2 need a name:
  herdr pane rename <pane_id> <name>
```

## Herdr entrypoints

- **action `list-names`** — the table above, from the command palette.
- **pane `picker`** — popup pane: lists names, search, pick, type a message, send.

## Tests

32 unit tests, no dependencies, run on the fixtures in
`tests/fixtures/session.json` (the shape of real `herdr agent list` / `pane list`
/ `tab list` / `workspace list` output, with invented names):

```bash
cd plugins/pane-name
npm test              # node --test tests/*.test.ts
npm run typecheck     # tsc --noEmit, needs a local typescript
npm run build         # tsc -p tsconfig.build.json -> dist/
```

The matcher (`src/resolve.ts`) is pure: snapshot in, verdict out. Herdr calls live
behind a one-method `Runner` interface (`src/runner.ts`), and `send`/`rename` take
that interface as a parameter, so the refusal rules are tested with a fake runner
that records the commands it was asked to run and proves nothing was sent.

Tests run against `src/`. Herdr runs `dist/`. `make build` regenerates `dist/` and
CI fails if the committed `dist/` no longer matches `src/`.

## Requirements

- Herdr 0.7+
- Node 18+ to run the compiled `dist/` output.
- Node 22.18+ or 23.6+ to run `src/*.ts` directly (tests, and the shim's fallback
  path when no build exists).
- `jq` is not needed by this plugin.

**Why `dist/` is committed.** Herdr runs plugin commands with the `node` on the
Herdr server's `PATH`, not the one in your shell. On the machine this plugin was
built on that was Node 20.20.2, which cannot execute TypeScript: a manifest
pointing at `src/cli.ts` failed inside Herdr with `ERR_UNKNOWN_FILE_EXTENSION`
while the same command worked by hand. So the manifest points at `dist/cli.js`,
`dist/` is checked in, and `bin/pane-name` prefers it too.

## Layout

```
herdr-plugin.toml     manifest: action list-names, popup pane picker
bin/pane-name         CLI shim (prefers dist/)
src/resolve.ts        pure tier matching, no I/O
src/runner.ts         the only Herdr-calling seam
src/actions.ts        send / rename, takes a Runner
src/format.ts         human-readable output
src/cli.ts            argument parsing, subcommands, exit codes
dist/                 compiled output, committed, what Herdr actually runs
tests/                node:test suites + fixtures
tsconfig.json         typecheck (src + tests)
tsconfig.build.json   emit to dist/
```
