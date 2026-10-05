# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Plugin versions are independent and live in each `herdr-plugin.toml`.

## [0.1.0] - 2026-10-04

### Added
- `plugins/pane-name` 0.1.0 — resolve a pane by label, agent name, tab name, or
  workspace name; refuse to send when the name is ambiguous. TypeScript, 32 unit
  tests, no runtime dependencies.
- `skills/herdr-pane-name` — resolve-then-send discipline for agents talking to
  other agents.
- `docs/herdr-reference.md` — manifest fields, injected env vars, contexts,
  placements, event names, CLI map, marketplace rules, verified against Herdr 0.9.3.
- `scripts/validate.py`, `scripts/link-all.sh`, `scripts/install-skills.sh` and the
  `validate` / `link` / `test` / `build` / `install-skills` make targets.
  `install-skills` keeps one canonical copy per skill in `~/.agents/skills` and
  symlinks it into `~/.claude/skills` and `~/.codex/skills` when they exist, never
  overwriting anything it did not create.
- GitHub issue and pull request templates, `validate` CI job.
- MIT license.
