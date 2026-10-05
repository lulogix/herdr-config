# herdr-config

Address agents in [Herdr](https://herdr.dev) **by name instead of pane id** — and
refuse to send when that name is not decisive.

Herdr's CLI takes pane ids like `w1:p6`. Nobody thinks in those. This repo is a
plugin plus a skill that let you (and your agents) say `baymax-reviewer` and get
the right pane, or get a clear refusal listing the panes that matched.

```bash
pane-name send baymax-reviewer "re-review the auth changes" --wait --read 40
```

Everything is a plain directory plus a manifest: no SDK, no fork of Herdr, no
privileged API. The plugin is an ordinary command Herdr launches; the skill is an
ordinary Markdown file agents read.

MIT licensed — fork it, vendor it, ship your own.

Verified end to end on **Herdr 0.9.3 / macOS**: a real agent prompt delivered to a
named pane with its reply read back, an ambiguous name refused with nothing sent,
the picker pane driven start to finish, and 32 unit tests over the matcher. The
Herdr behaviour that surprised me while building it (plugin commands run under the
server's `node`, CLI-invoked actions target the focused pane, event payloads are an
envelope) is written down in [docs/herdr-reference.md](docs/herdr-reference.md).

## What's here

```text
herdr-config/
├── LICENSE                     MIT
├── SECURITY.md                 what the plugin runs, writes, and does not touch
├── CONTRIBUTING.md
├── CHANGELOG.md
├── Makefile                    validate / build / test / link / install-skills
├── docs/herdr-reference.md     manifest fields, env vars, event names, CLI map
├── plugins/pane-name/          the plugin: TypeScript, 32 unit tests, no deps
├── skills/herdr-pane-name/     the skill: how agents should use it
├── scripts/
│   ├── validate.py             manifest + entrypoint validation
│   ├── link-all.sh             link every plugin in this repo locally
│   └── install-skills.sh       copy skills into ~/.agents/skills, symlink into agent dirs
└── .github/workflows/validate.yml
```

## Requirements

| Thing | Version |
| --- | --- |
| Herdr | `>= 0.7.0` (tested against `0.9.3`) |
| Node.js | 18+ to run the committed `dist/` output |
| Node.js | 22.18+ or 23.6+ to run `src/*.ts` directly (tests only) |

`jq` is not needed.

## Install the plugin

```bash
herdr plugin install lulogix/herdr-config/plugins/pane-name --yes
herdr plugin list
```

`plugin install` takes the `owner/repo/subdir` shorthand, clones with `git`, shows
a trust preview of the source and the commands it will run, then stores the
checkout in Herdr-managed plugin data. Re-running it refreshes the checkout — that
is the update path; there is no `plugin update` in plugin v1. Use `--ref <sha>` to
pin a revision.

From a clone, for development:

```bash
git clone https://github.com/lulogix/herdr-config
cd herdr-config
make link          # herdr plugin link ./plugins/pane-name
make test
```

`plugin link` does **not** copy files or run build commands: it points Herdr at
your working tree, so edits apply on the next invocation.

```bash
herdr plugin enable   herdr-config.pane-name
herdr plugin disable  herdr-config.pane-name
herdr plugin unlink   herdr-config.pane-name          # local dev: unregister, keep files
herdr plugin uninstall lulogix/herdr-config/plugins/pane-name
```

Plugin registration and enabled state are **global to your user** and apply to
every Herdr session.

## Install the skill

```bash
npx skills add lulogix/herdr-config --skill herdr-pane-name -g
```

Or from a clone, without npx:

```bash
make install-skills        # canonical copy in ~/.agents/skills, symlinks into
                           # ~/.claude/skills (and ~/.codex/skills if present)
make install-skills DRY=1  # show what it would do
make uninstall-skills
```

One canonical copy per skill, symlinks from there into every agent skill directory
that already exists. It never overwrites a directory or symlink it did not create.
Restart the agent session afterwards — skills are read at startup.

The upstream Herdr skill is the base this skill assumes. Install it first:

```bash
npx skills add herdrdev/herdr --skill herdr -g
# or print the copy bundled with your binary:
herdr --skill
```

## Use it

Give the panes you care about a name once:

```bash
herdr pane rename w1:p6 baymax-reviewer
```

Then address them:

```bash
pane-name names                              # every addressable name
pane-name resolve baymax-reviewer            # unique: w1:p6 [tier: exact-name]
pane-name send baymax-reviewer "re-review the auth changes" --wait --read 40
pane-name resolve konoha                     # 2 panes match - nothing was chosen
```

Resolution tiers, first match wins:

| Tier | Match |
| --- | --- |
| `pane-id` | the query is exactly a pane id — returned first, never fuzzy-matched |
| `exact-name` | pane label or agent name, exact |
| `partial-name` | substring of a label or agent name |
| `tab-name` | tab label, **only** for the single unnamed pane in that tab |
| `workspace-name` | workspace label, same single-unnamed-pane rule |
| `context` | terminal title, cwd basename, agent kind — last resort |

Exit codes: `0` sent · `2` usage · **`3` ambiguous, nothing was sent** · `4` no
match · `5` Herdr call failed.

Full behaviour, examples, and the picker pane:
[plugins/pane-name/README.md](plugins/pane-name/README.md).

## Verify before you install

A plugin is ordinary code that runs as you, with your environment and the full
Herdr CLI. Read the manifest and the scripts first.

```bash
make validate      # parses herdr-plugin.toml, checks fields, ids, referenced entrypoints
make test          # 32 unit tests over the matcher and the refusal rules
```

[SECURITY.md](SECURITY.md) lists exactly which binaries this plugin runs, what it
writes, what it never touches, and how to report a vulnerability.

## Marketplace

This repo is listed on [herdr.dev/plugins](https://herdr.dev/plugins/) because it
carries the GitHub topic `herdr-plugin` and the manifest sits in a subdirectory of
the default branch. The index is automatic and unreviewed.

To list your own fork: add the `herdr-plugin` topic, keep a parseable
`herdr-plugin.toml` at the root or in a subdirectory, and wait for the 30-minute
rescan.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version: one directory per plugin
under `plugins/`, one directory per skill under `skills/`, `make validate` and
`make test` must pass, and prefer a deep module with tests over a pile of scripts.

## License

MIT — see [LICENSE](LICENSE). Herdr itself is not part of this repo and is not
affiliated with this plugin; install at your own judgement.
