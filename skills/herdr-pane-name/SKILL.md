---
name: herdr-pane-name
description: "Talk to another agent in a Herdr session by pane name instead of pane id. Use when the user asks you to message, prompt, ask, wake, or hand work to another agent ('ask the reviewer', 'tell the test agent to rerun', 'send this to my other pane'), or refers to a pane by a name rather than w1:p6. Resolves names through the pane-name plugin and refuses to send when a name matches more than one pane. Requires HERDR_ENV=1."
---

# Addressing another pane by name

Pane ids (`w1:p6`) are what Herdr's CLI takes, but they are not what the user
remembers. Resolve the name they gave you into exactly one pane, then act. Never
guess which pane they meant.

## Guardrail

```bash
test "${HERDR_ENV:-}" = 1
```

If this fails, say you are not running inside a Herdr-managed pane and stop. Do
not control a session you do not own.

## Find the resolver

```bash
pane_name() {
  local root
  root=$(herdr plugin list 2>/dev/null | sed -n 's/.*pane-name.*\[local:\(.*\)\].*/\1/p' | head -1)
  if [ -z "$root" ]; then
    root=$(find "${XDG_DATA_HOME:-$HOME/.local/share}/herdr" "$HOME/.config/herdr" \
             -maxdepth 4 -type d -name pane-name 2>/dev/null | head -1)
  fi
  if [ -z "$root" ]; then
    echo "pane-name plugin not found. Install it with:" >&2
    echo "  herdr plugin install lulogix/herdr-config/plugins/pane-name --yes" >&2
    return 1
  fi
  bash "$root/bin/pane-name" "$@"
}
```

If the user has aliased it to `pane-name` on PATH, use that instead.

## Step 1: resolve before you send

```bash
pane_name resolve "<name>"
```

| Exit code | Meaning | What you do |
| --- | --- | --- |
| 0 | exactly one pane | proceed |
| 3 | **ambiguous** | **do not send.** Report the candidates and ask |
| 4 | no match | report the names that do exist, ask which one |
| 5 | Herdr call failed | report it, do not retry blindly |

On exit 3 or 4 the tool already printed the candidate panes, their labels, agent
state, tab, and which field matched. Quote that back. Do not pick the "obvious"
one: a prompt sent to the wrong agent is work done in the wrong repo.

## Step 2: send

```bash
# Prompt an agent pane
pane_name send "<name>" "review the diff in src/auth.ts, report blockers only"

# Wait for it to return to idle, then read its answer
pane_name send "<name>" "rerun the failing test" --wait --read 40

# Run a shell command in a plain pane
pane_name send "<name>" "make test" --cmd

# Narrow a name you already know the scope of
pane_name send "app-agent" "sync status" --tab w1:t2
```

`send` re-resolves internally and refuses again on ambiguity, so it is safe to
call directly. It uses `herdr agent prompt` for a pane hosting an agent and
`herdr pane run` for a plain shell pane.

## Step 3: report what actually happened

Say which pane received it and how it was matched:

```
sent to w1:p6 via agent-prompt [tier: exact-name]
```

The tier matters to the user: `pane-id` / `exact-name` means they named it,
`tab-name` / `workspace-name` means it was inferred from the tab, `context` means
it matched a terminal title and is worth double-checking.

## When nothing is named yet

```bash
pane_name names
```

If the panes the user cares about are unnamed, name them once and tell them what
you named:

```bash
herdr pane rename w1:p6 reviewer
herdr agent start reviewer --kind pi --pane w1:p6   # when you are starting it yourself
```

Prefer a name that survives a restart of the agent: a pane label belongs to the
pane, an agent name belongs to the process.

## Rules

- Resolve first, send second. Exit 3 means nothing was sent - say so plainly.
- A name shaped like an id is an id. `w9:p9` is a missing pane, not a typo to fix.
- A tab name only identifies a pane when that tab holds one unnamed pane.
- Do not use `herdr pane send-text` to fake a prompt. Use `agent prompt` so Herdr
  tracks the agent's state.
- Do not name panes the user did not ask you to name.
