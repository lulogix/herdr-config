#!/usr/bin/env python3
"""Validate every Herdr plugin manifest and skill file in this repository.

Checks the contract Herdr enforces (required metadata, id character sets, id
uniqueness, argv command shape, link-handler -> action wiring) plus the things
Herdr cannot see: that referenced scripts exist and are executable, and that
skills carry usable frontmatter.

Usage:
  python3 scripts/validate.py [--strict] [--root PATH]

Exit codes: 0 clean, 1 errors found, 2 no plugins or skills found.
"""

from __future__ import annotations

import argparse
import re
import stat
import sys
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:
    sys.exit("validate.py requires Python 3.11+ (tomllib)")

PLUGIN_ID_RE = re.compile(r"^[A-Za-z0-9._:-]+$")
LOCAL_ID_RE = re.compile(r"^[A-Za-z0-9:_-]+$")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$")

PLATFORMS = {"linux", "macos", "windows"}
CONTEXTS = {"global", "workspace", "tab", "pane", "selection"}
PLACEMENTS = {"overlay", "popup", "split", "tab", "zoomed"}

# Lifecycle events present in the Herdr 0.9.3 build. Not a promise about future
# versions: an unknown name is a warning, not an error.
KNOWN_EVENTS = {
    "workspace.created", "workspace.closed", "workspace.focused", "workspace.moved",
    "workspace.renamed", "workspace.reordered", "workspace.updated",
    "workspace.metadata_updated",
    "tab.created", "tab.closed", "tab.focused", "tab.moved", "tab.renamed",
    "pane.created", "pane.closed", "pane.exited", "pane.focused", "pane.moved",
    "pane.updated", "pane.scroll_changed", "pane.agent_detected",
    "pane.agent_status_changed", "pane.output_matched",
    "worktree.created", "worktree.opened", "worktree.removed",
    "server.connected", "server.live_handoff",
    "plugin.linked", "plugin.unlinked", "plugin.enabled", "plugin.disabled",
    "plugin.pane.opened", "plugin.pane.closed", "plugin.pane.focused",
    "plugin.action_invoked",
}

SCRIPT_SUFFIXES = {".sh", ".bash", ".js", ".mjs", ".cjs", ".py", ".lua", ".rb", ".ts"}
INTERPRETERS = {"sh", "bash", "zsh", "node", "bun", "deno", "python3", "python", "lua", "ruby", "pwsh"}

REQUIRED_TOP_LEVEL = {
    "id": str,
    "name": str,
    "version": str,
    "min_herdr_version": str,
}


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, where: str, message: str) -> None:
        self.errors.append(f"{where}: {message}")

    def warn(self, where: str, message: str) -> None:
        self.warnings.append(f"{where}: {message}")


def check_command(report: Report, where: str, command, plugin_dir: Path, *, executable_required: bool) -> None:
    if not isinstance(command, list) or not command:
        report.error(where, "command must be a non-empty argv array")
        return
    if not all(isinstance(part, str) and part for part in command):
        report.error(where, "every command element must be a non-empty string")
        return

    head = command[0]
    if head in INTERPRETERS and len(command) > 1:
        target = command[1]
        if "/" in target or Path(target).suffix in SCRIPT_SUFFIXES:
            script = (plugin_dir / target).resolve()
            if not script.is_file():
                report.error(where, f"{head} {target}: referenced file does not exist")
                return
            # An interpreter argument only has to be readable; the exec bit matters
            # when the file itself is argv[0].
            if target.endswith((".sh", ".bash")):
                first_line = script.read_text(errors="replace").splitlines()
                if not first_line or not first_line[0].startswith("#!"):
                    report.warn(where, f"{target} has no shebang")
            return

    if head not in INTERPRETERS:
        if "/" in head:
            script = (plugin_dir / head).resolve()
            if not script.is_file():
                report.error(where, f"{head}: entrypoint script does not exist")
                return
            if not (script.stat().st_mode & stat.S_IXUSR):
                report.error(where, f"{head}: entrypoint script is not executable")
                return
            first_line = script.read_text(errors="replace").splitlines()
            if not first_line or not first_line[0].startswith("#!"):
                report.warn(where, f"{head} has no shebang")
        elif executable_required:
            report.warn(where, f"{head}: entrypoint is resolved from PATH, not from the plugin directory")


def check_entrypoints(report: Report, manifest: dict, plugin_dir: Path, where: str) -> int:
    count = 0

    action_ids: list[str] = []
    for index, action in enumerate(manifest.get("actions", []) or []):
        label = f"{where} actions[{index}]"
        count += 1
        if not isinstance(action, dict):
            report.error(label, "action must be a table")
            continue
        action_id = action.get("id")
        if not isinstance(action_id, str) or not action_id:
            report.error(label, "action id is required")
        elif not LOCAL_ID_RE.match(action_id):
            report.error(label, f"action id {action_id!r} may not contain dots or other characters outside [A-Za-z0-9:_-]")
        elif action_id in action_ids:
            report.error(label, f"duplicate action id {action_id!r}")
        else:
            action_ids.append(action_id)
        if not action.get("title"):
            report.warn(label, "action has no title; it will be hard to recognise in the UI")
        contexts = action.get("contexts")
        if contexts is None:
            report.warn(label, "no contexts declared; the action may not appear where you expect")
        elif not isinstance(contexts, list) or not contexts:
            report.error(label, "contexts must be a non-empty array")
        else:
            unknown = [c for c in contexts if c not in CONTEXTS]
            if unknown:
                report.error(label, f"unknown context(s) {unknown}; allowed: {sorted(CONTEXTS)}")
        check_command(report, label, action.get("command"), plugin_dir, executable_required=False)

    pane_ids: list[str] = []
    for index, pane in enumerate(manifest.get("panes", []) or []):
        label = f"{where} panes[{index}]"
        count += 1
        if not isinstance(pane, dict):
            report.error(label, "pane must be a table")
            continue
        pane_id = pane.get("id")
        if not isinstance(pane_id, str) or not pane_id:
            report.error(label, "pane id is required")
        elif not LOCAL_ID_RE.match(pane_id):
            report.error(label, f"pane id {pane_id!r} is invalid")
        elif pane_id in pane_ids:
            report.error(label, f"duplicate pane id {pane_id!r}")
        else:
            pane_ids.append(pane_id)
        placement = pane.get("placement")
        if placement is not None and placement not in PLACEMENTS:
            report.error(label, f"unknown placement {placement!r}; allowed: {sorted(PLACEMENTS)}")
        if not pane.get("title"):
            report.warn(label, "pane has no title")
        check_command(report, label, pane.get("command"), plugin_dir, executable_required=True)

    handler_ids: list[str] = []
    for index, handler in enumerate(manifest.get("link_handlers", []) or []):
        label = f"{where} link_handlers[{index}]"
        count += 1
        if not isinstance(handler, dict):
            report.error(label, "link handler must be a table")
            continue
        handler_id = handler.get("id")
        if not isinstance(handler_id, str) or not handler_id:
            report.error(label, "link handler id is required")
        elif not LOCAL_ID_RE.match(handler_id):
            report.error(label, f"link handler id {handler_id!r} is invalid")
        elif handler_id in handler_ids:
            report.error(label, f"duplicate link handler id {handler_id!r}")
        else:
            handler_ids.append(handler_id)
        pattern = handler.get("pattern")
        if not isinstance(pattern, str) or not pattern:
            report.error(label, "pattern is required (Rust regex matched against the clicked URL)")
        else:
            try:
                re.compile(pattern)
            except re.error as exc:
                report.error(label, f"pattern does not compile as a regex: {exc}")
        action_ref = handler.get("action")
        if not isinstance(action_ref, str) or not action_ref:
            report.error(label, "action must name an action declared by this plugin")
        elif action_ref not in action_ids:
            report.error(label, f"action {action_ref!r} is not declared by this plugin")

    for index, event in enumerate(manifest.get("events", []) or []):
        label = f"{where} events[{index}]"
        count += 1
        if not isinstance(event, dict):
            report.error(label, "event hook must be a table")
            continue
        on = event.get("on")
        if not isinstance(on, str) or not on:
            report.error(label, "on is required")
        elif on not in KNOWN_EVENTS:
            report.warn(label, f"event {on!r} is not in the known 0.9.3 event list; verify against your Herdr build")
        check_command(report, label, event.get("command"), plugin_dir, executable_required=True)

    for key in ("startup", "build"):
        for index, item in enumerate(manifest.get(key, []) or []):
            label = f"{where} {key}[{index}]"
            count += 1
            if not isinstance(item, dict):
                report.error(label, f"{key} entry must be a table")
                continue
            check_command(report, label, item.get("command"), plugin_dir, executable_required=(key == "startup"))

    if count == 0:
        report.error(where, "manifest declares no entrypoints (actions, panes, events, startup, build, link_handlers)")

    return count


def check_platforms(report: Report, manifest: dict, where: str) -> None:
    platforms = manifest.get("platforms")
    if platforms is None:
        report.warn(where, "no top-level platforms declared; local linking will warn")
        return
    if not isinstance(platforms, list) or not platforms:
        report.error(where, "platforms must be a non-empty array")
        return
    unknown = [p for p in platforms if p not in PLATFORMS]
    if unknown:
        report.error(where, f"unknown platform(s) {unknown}; allowed: {sorted(PLATFORMS)}")


def validate_plugins(root: Path, report: Report) -> int:
    plugins_dir = root / "plugins"
    manifests = sorted(plugins_dir.glob("*/herdr-plugin.toml"))
    if not manifests:
        report.error(str(plugins_dir), "no plugins/*/herdr-plugin.toml found")
        return 0

    seen_ids: dict[str, str] = {}
    for manifest_path in manifests:
        plugin_dir = manifest_path.parent
        where = plugin_dir.relative_to(root).as_posix()
        try:
            manifest = tomllib.loads(manifest_path.read_text(encoding="utf-8"))
        except tomllib.TOMLDecodeError as exc:
            report.error(where, f"manifest is not valid TOML: {exc}")
            continue

        for key, expected in REQUIRED_TOP_LEVEL.items():
            value = manifest.get(key)
            if not isinstance(value, expected) or (isinstance(value, str) and not value):
                report.error(where, f"required top-level key {key!r} is missing or not a non-empty string")

        plugin_id = manifest.get("id")
        if isinstance(plugin_id, str):
            if not PLUGIN_ID_RE.match(plugin_id):
                report.error(where, f"plugin id {plugin_id!r} may only use [A-Za-z0-9._:-]")
            elif plugin_id in seen_ids:
                report.error(where, f"plugin id {plugin_id!r} already used by {seen_ids[plugin_id]}")
            else:
                seen_ids[plugin_id] = where

        for key in ("version", "min_herdr_version"):
            value = manifest.get(key)
            if isinstance(value, str) and not VERSION_RE.match(value):
                report.error(where, f"{key} {value!r} is not a recognizable x.y.z version")

        if not manifest.get("description"):
            report.warn(where, "no description; the marketplace card and plugin list will be sparse")

        check_platforms(report, manifest, where)
        entrypoints = check_entrypoints(report, manifest, plugin_dir, where)

        if not (plugin_dir / "README.md").is_file():
            report.warn(where, "no README.md; users cannot review what this plugin runs before installing")

        print(f"  ok  {where}  id={plugin_id}  entrypoints={entrypoints}")

    return len(manifests)


def validate_skills(root: Path, report: Report) -> int:
    skills_dir = root / "skills"
    if not skills_dir.is_dir():
        report.warn(str(root), "no skills/ directory")
        return 0

    skill_files = sorted(skills_dir.glob("*/SKILL.md"))
    if not skill_files:
        report.warn(str(skills_dir), "no skills/*/SKILL.md found")
        return 0

    for skill_file in skill_files:
        where = skill_file.parent.relative_to(root).as_posix()
        text = skill_file.read_text(encoding="utf-8")
        if not text.startswith("---"):
            report.error(where, "SKILL.md must start with YAML frontmatter")
            continue
        end = text.find("\n---", 3)
        if end == -1:
            report.error(where, "frontmatter is not closed")
            continue
        frontmatter = text[3:end]
        fields: dict[str, str] = {}
        current_key = None
        for line in frontmatter.splitlines():
            match = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
            if match:
                current_key = match.group(1)
                fields[current_key] = match.group(2).strip().strip('"').strip("'")
            elif current_key and line.strip():
                fields[current_key] = (fields[current_key] + " " + line.strip()).strip()

        name = fields.get("name")
        description = fields.get("description")
        if not name:
            report.error(where, "frontmatter needs a name")
        elif name != skill_file.parent.name:
            report.error(where, f"frontmatter name {name!r} does not match directory {skill_file.parent.name!r}")
        if not description:
            report.error(where, "frontmatter needs a description")
        elif len(description) < 40:
            report.warn(where, "description is short; include the trigger phrases a user would say")
        if "HERDR_ENV" not in text:
            report.warn(where, "no HERDR_ENV guardrail found; Herdr skills should refuse to run outside a Herdr pane")

        print(f"  ok  {where}  name={name}")

    return len(skill_files)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    parser.add_argument("--strict", action="store_true", help="treat warnings as errors")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    report = Report()

    print(f"validating {root}")
    plugins = validate_plugins(root, report)
    skills = validate_skills(root, report)

    if plugins == 0 and skills == 0:
        print("nothing found to validate")
        return 2

    for warning in report.warnings:
        print(f"WARN  {warning}")
    for error in report.errors:
        print(f"ERROR {error}")

    print(f"\n{plugins} plugin manifest(s), {skills} skill(s), "
          f"{len(report.errors)} error(s), {len(report.warnings)} warning(s)")

    if report.errors or (args.strict and report.warnings):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
