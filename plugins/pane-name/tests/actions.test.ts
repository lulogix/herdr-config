import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { renamePane, sendToPane } from "../src/actions.ts";
import type { Snapshot } from "../src/resolve.ts";
import type { RunResult, Runner } from "../src/runner.ts";

const snapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/session.json", import.meta.url)), "utf8"),
) as Snapshot;

/** Records every Herdr call it was asked to make. Nothing is ever executed. */
class FakeRunner implements Runner {
  calls: string[][];
  responses: Map<string, RunResult>;

  constructor(responses: Record<string, RunResult> = {}) {
    this.calls = [];
    this.responses = new Map(Object.entries(responses));
  }

  run(args: string[]): RunResult {
    this.calls.push(args);
    return this.responses.get(args.join(" ")) ?? { ok: true, stdout: "{}", stderr: "" };
  }
}

test("an ambiguous name sends nothing", () => {
  const runner = new FakeRunner();
  const outcome = sendToPane("review", "check the diff", {}, snapshot, runner);

  assert.equal(outcome.outcome, "refused");
  assert.equal(outcome.reason, "ambiguous");
  assert.deepEqual(runner.calls, []);
  assert.equal(outcome.result.status, "ambiguous");
});

test("a name that matches nothing sends nothing", () => {
  const runner = new FakeRunner();
  const outcome = sendToPane("nope", "hello", {}, snapshot, runner);

  assert.equal(outcome.outcome, "refused");
  assert.equal(outcome.reason, "no-match");
  assert.deepEqual(runner.calls, []);
});

test("a resolved agent pane is prompted, not run", () => {
  const runner = new FakeRunner();
  const outcome = sendToPane("reviewer", "review the diff please", {}, snapshot, runner);

  assert.equal(outcome.outcome, "sent");
  assert.equal(outcome.pane_id, "w1:p3");
  assert.equal(outcome.mode, "agent-prompt");
  assert.deepEqual(runner.calls, [["agent", "prompt", "w1:p3", "review the diff please"]]);
});

test("--wait is passed through to agent prompt", () => {
  const runner = new FakeRunner();
  sendToPane("reviewer", "ping", { wait: true }, snapshot, runner);

  assert.deepEqual(runner.calls, [["agent", "prompt", "w1:p3", "ping", "--wait"]]);
});

test("--read appends an agent read after the prompt", () => {
  const runner = new FakeRunner();
  const outcome = sendToPane("reviewer", "ping", { read: 40 }, snapshot, runner);

  assert.equal(outcome.outcome, "sent");
  assert.equal(runner.calls.length, 2);
  assert.deepEqual(runner.calls[1], ["agent", "read", "w1:p3", "--source", "recent-unwrapped", "--lines", "40"]);
});

test("a plain shell pane is run, not prompted", () => {
  const runner = new FakeRunner();
  const outcome = sendToPane("w1:p5", "make test", {}, snapshot, runner);

  assert.equal(outcome.outcome, "sent");
  assert.equal(outcome.mode, "pane-run");
  assert.deepEqual(runner.calls, [["pane", "run", "w1:p5", "make test"]]);
});

test("--cmd forces a shell command even into an agent pane", () => {
  const runner = new FakeRunner();
  const outcome = sendToPane("reviewer", "git status", { asCommand: true }, snapshot, runner);

  if (outcome.outcome !== "sent") throw new Error(`expected sent, got ${outcome.outcome}`);
  assert.equal(outcome.mode, "pane-run");
  assert.deepEqual(runner.calls, [["pane", "run", "w1:p3", "git status"]]);
});

test("a failed Herdr send reports failed, not sent", () => {
  const runner = new FakeRunner({
    "agent prompt w1:p3 ping": { ok: false, stdout: "", stderr: "agent_pane_busy" },
  });
  const outcome = sendToPane("reviewer", "ping", {}, snapshot, runner);

  assert.equal(outcome.outcome, "failed");
  assert.equal(outcome.response.stderr, "agent_pane_busy");
});

test("rename refuses an ambiguous name", () => {
  const runner = new FakeRunner();
  const outcome = renamePane("review", "reviewer-a", snapshot, runner);

  assert.equal(outcome.outcome, "refused");
  assert.deepEqual(runner.calls, []);
});

test("rename on a unique pane calls pane rename", () => {
  const runner = new FakeRunner();
  const outcome = renamePane("docs", "docs-main", snapshot, runner);

  assert.equal(outcome.outcome, "renamed");
  assert.equal(outcome.pane_id, "w1:p2");
  assert.deepEqual(runner.calls, [["pane", "rename", "w1:p2", "docs-main"]]);
});

test("rename --clear clears the label", () => {
  const runner = new FakeRunner();
  const outcome = renamePane("notes", null, snapshot, runner);

  assert.equal(outcome.outcome, "renamed");
  assert.equal(outcome.label, null);
  assert.deepEqual(runner.calls, [["pane", "rename", "w1:p4", "--clear"]]);
});
