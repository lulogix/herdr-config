import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const pluginDir = path.resolve(new URL("..", import.meta.url).pathname);
const shim = path.join(pluginDir, "bin", "pane-name");

// Installed as ~/.local/bin/pane-name -> this script. dirname of the symlink is
// not the plugin directory, and a shim that gets this wrong fails with
// MODULE_NOT_FOUND only for people who installed it the normal way.
test("the shim finds the plugin when called through a symlink", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pane-name-shim-"));
  const link = path.join(dir, "pane-name");
  fs.symlinkSync(shim, link);

  const help = spawnSync(link, ["--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /pane-name resolve \[--json\][^\n]*<query>/);

  // A missing query is a usage error from the CLI. A broken path instead gives
  // node's MODULE_NOT_FOUND, which is what this test guards against.
  const noQuery = spawnSync(link, ["resolve"], { encoding: "utf8" });
  assert.equal(noQuery.status, 2);
  assert.doesNotMatch(noQuery.stderr, /MODULE_NOT_FOUND|Cannot find module/);
  assert.match(noQuery.stderr, /usage:/);

  fs.rmSync(dir, { recursive: true, force: true });
});
