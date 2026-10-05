## What is in this PR

- [ ] new plugin under `plugins/<name>/`
- [ ] new skill under `skills/<name>/`
- [ ] fix or docs change

## Plugin id and entrypoints

```text

```

## Herdr version tested

```bash
herdr --version
```

## Platforms tested

- [ ] linux
- [ ] macos
- [ ] windows

## Validation

```bash
make validate
```

Paste the summary line.

## How a reviewer can test it safely

```bash

```

## Review notes

- Every command Herdr will run for this plugin:
- Config written to `HERDR_PLUGIN_CONFIG_DIR`:
- State written to `HERDR_PLUGIN_STATE_DIR`:
- Panes this plugin may open, and how it closes only those:
- New external dependencies (Herdr does not install toolchains for you):
