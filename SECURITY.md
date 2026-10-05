# Security Policy

## The trust model

A Herdr plugin is ordinary code that runs as you, with your environment, and can
call the entire Herdr CLI. Herdr validates manifests and separates config from
state, but it does **not** review or sandbox plugin code.

That means:

- `herdr plugin install` and `herdr plugin link` execute whatever the manifest
  declares, on your machine.
- A plugin listed on [herdr.dev/plugins](https://herdr.dev/plugins/) only proved
  that its repository tagged itself `herdr-plugin` and that its manifest parsed.
  A listing is not a security review.
- A plugin's config directory may contain credentials. It lives outside git, and
  this repo never writes secrets there automatically.

## Before installing anything from this repo

```bash
herdr plugin install lulogix/herdr-config/plugins/pane-name     # no --yes: read the preview
```

Read the preview of the source and the commands Herdr will run. Then read the
manifest and every script it references:

```bash
cat plugins/pane-name/herdr-plugin.toml
cat plugins/pane-name/bin/pane-name
cat plugins/pane-name/src/*.ts
```

Pin a revision when it matters:

```bash
herdr plugin install lulogix/herdr-config/plugins/pane-name --ref <commit-sha> --yes
```

## What the plugin in this repo does

| Plugin | External binaries | Network | Writes |
| --- | --- | --- | --- |
| pane-name | `node`, `herdr` | none | nothing |

It opens no sockets, downloads nothing, and reads no credentials. It reads session
state through `herdr agent list`, `pane list`, `tab list`, and `workspace list`, and
it writes only by asking Herdr to prompt a pane, run text in a pane, or rename a
pane.

The one thing to think about: **`pane-name` sends text into other panes.** Read what
it resolved before you let it prompt someone else's agent — which is why an
ambiguous name is a refusal (exit 3) rather than a guess, and why the skill tells
agents to run `resolve` before `send` when the name is new to them.

## Reporting a vulnerability

Open a **draft** issue titled `security: <short summary>` and put no exploit details
in it, or email `hello@lulogix.dev`. Expect a response within seven days.

Disclose privately rather than in a general issue: a plugin vulnerability is a
prompt to run code on every reader's machine.

## Scope

Vulnerabilities in these plugins, and Herdr version drift that breaks the
assumptions documented in [docs/herdr-reference.md](docs/herdr-reference.md).
Vulnerabilities in Herdr itself belong to the Herdr project, not this repo.
