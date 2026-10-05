# Skills

One directory per skill. Each directory contains exactly one `SKILL.md` with
YAML frontmatter:

```text
skills/
└── herdr-pane-name/SKILL.md
```

```markdown
---
name: skill-name
description: "What it does and when to use it. Include the trigger words a user
would actually say. State any environment precondition."
---
```

## Install

```bash
# from this repo, once published
npx skills add lulogix/herdr-config --skill herdr-pane-name -g

# from a local checkout: canonical copy plus symlinks into agent skill dirs
make install-skills

# or by hand
cp -R skills/herdr-pane-name ~/.agents/skills/
```

`-g` installs globally for supported agents; omit it to install into the current
project. For agents with no skill system, paste `SKILL.md` into the agent's
project or user instructions.

Install the upstream Herdr skill first — everything here assumes it:

```bash
npx skills add herdrdev/herdr --skill herdr -g
herdr --skill        # or print the copy bundled with your installed binary
```

## Writing rules these skills follow

1. **State the precondition first.** Every Herdr skill starts with
   `test "${HERDR_ENV:-}" = 1` and stops if it fails. An agent must not control a
   session it does not own.
2. **Say when to use it, in the user's words.** The `description` field is the
   trigger. "asks for a helper agent", "set up my panes", "layout", "split".
3. **Do not guess syntax.** Tell the agent to run `herdr --help` and the command
   group without a subcommand; the installed binary is the authority.
4. **Never bare `herdr` for discovery** — it launches or attaches the TUI. Never
   probe a mutating command by omitting arguments: `herdr workspace create` is
   valid with defaults and will execute.
5. **Read identifiers from JSON responses**, e.g. `.result.pane.pane_id`, and
   never reuse a `previous_pane_id` as a general target.
6. **Prefer waits over sleeps** (`pane wait-output`, `agent wait`) and prefer
   reads over claims about what finished.
7. **State the difference between `pane` and `agent` commands**: topology and
   ordinary processes belong to panes; identity and lifecycle states belong to
   agents.
8. **Include a failure-modes table.** A skill that only documents the happy path
   produces agents that retry blindly.
9. **Keep it to one job.** A skill that tries to cover layout, delegation, and
   addressing gets triggered for work it has nothing useful to say about.

## Check your frontmatter

```bash
python3 scripts/validate.py        # also checks skills for name + description
```
