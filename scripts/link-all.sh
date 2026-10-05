#!/usr/bin/env bash
# Link every plugin under plugins/ into the local Herdr install.
# `plugin link` does not copy files or run build commands: Herdr points at this
# working tree, so edits apply on the next invocation.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
herdr="${HERDR_BIN_PATH:-herdr}"

if ! command -v "$herdr" >/dev/null 2>&1; then
  echo "link-all: herdr not found on PATH. Install it first: https://herdr.dev/docs/install/" >&2
  exit 1
fi

linked=0
for manifest in "$root"/plugins/*/herdr-plugin.toml; do
  [ -e "$manifest" ] || continue
  dir="$(dirname "$manifest")"
  id=$(sed -n 's/^id[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest" | head -n 1)
  echo "linking ${dir#"$root"/} as ${id:-<unknown id>}"
  "$herdr" plugin link "$dir"
  linked=$((linked + 1))
done

if [ "$linked" = 0 ]; then
  echo "link-all: no plugins found under $root/plugins" >&2
  exit 1
fi

echo
"$herdr" plugin list
echo
echo "next: herdr plugin action list --plugin <id>"
echo "      herdr plugin log list --plugin <id>"
echo "unlink with: herdr plugin unlink <id>"
