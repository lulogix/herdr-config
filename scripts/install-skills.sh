#!/usr/bin/env bash
# Install this repo's skills into the local agent skill directories.
#
# One canonical copy per skill lives in $SKILLS_DIR (default ~/.agents/skills).
# Other agent directories that already exist get a relative symlink to it, which
# is how Claude Code picks up shared skills on this machine:
#
#   ~/.claude/skills/herdr-pane-name -> ../../.agents/skills/herdr-pane-name
#
# Nothing is overwritten: if a target already exists and is not a symlink to the
# canonical copy, the skill is skipped with a warning.

set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
canonical=${SKILLS_DIR:-$HOME/.agents/skills}

dry_run=0
unlink=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=1 ;;
    --unlink) unlink=1 ;;
    -h|--help)
      sed -n '2,16p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "unknown option: $arg (try --dry-run or --unlink)" >&2
      exit 2
      ;;
  esac
done

targets=()
for dir in "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.config/pi/skills"; do
  [ -d "$dir" ] && targets+=("$dir")
done

if [ "${#targets[@]}" -eq 0 ]; then
  echo "no agent skill directories found; looked for:" >&2
  echo "  ~/.claude/skills ~/.codex/skills ~/.config/pi/skills" >&2
  echo "create one, or set SKILLS_DIR=<dir> to install into a specific place." >&2
  exit 1
fi

echo "canonical: $canonical"
echo "linking into:"
for dir in "${targets[@]}"; do echo "  $dir"; done
echo

installed=0
skipped=0
for skill_dir in "$root"/skills/*/; do
  [ -f "$skill_dir/SKILL.md" ] || continue
  name=$(basename "$skill_dir")

  if [ "$unlink" -eq 1 ]; then
    for dir in "${targets[@]}"; do
      if [ -L "$dir/$name" ]; then
        echo "unlink $dir/$name"
        [ "$dry_run" -eq 0 ] && rm "$dir/$name"
      fi
    done
    if [ -d "$canonical/$name" ]; then
      echo "remove  $canonical/$name"
      [ "$dry_run" -eq 0 ] && rm -rf "$canonical/$name"
    fi
    continue
  fi

  echo "copy    $canonical/$name"
  if [ "$dry_run" -eq 0 ]; then
    mkdir -p "$canonical/$name"
    cp -R "$skill_dir"/. "$canonical/$name"/
  fi

  for dir in "${targets[@]}"; do
    link="$dir/$name"
    if [ -L "$link" ]; then
      resolved=$(readlink "$link")
      case "$resolved" in
        *".agents/skills/$name"|"$canonical/$name")
          echo "link    $link (already)"
          continue
          ;;
      esac
      echo "skip    $link is a symlink to something else; not overwriting" >&2
      skipped=$((skipped + 1))
      continue
    fi

    if [ -e "$link" ]; then
      echo "skip    $link exists and is not this repo's skill; not overwriting" >&2
      skipped=$((skipped + 1))
      continue
    fi

    echo "link    $link"
    if [ "$dry_run" -eq 0 ]; then
      mkdir -p "$dir"
      if [ "$dir" != "$canonical" ]; then
        ln -s "$(python3 -c "import os.path;print(os.path.relpath('$canonical/$name','$dir'))")" "$link"
      fi
    fi
    installed=$((installed + 1))
  done
done

echo
if [ "$unlink" -eq 1 ]; then
  echo "removed this repo's skills from ${#targets[@]} agent director$([ "${#targets[@]}" -eq 1 ] && echo y || echo ies)"
  exit 0
fi
echo "done: $installed new link(s), $skipped skipped."
echo "next: restart the agent session so the new skills are picked up."
