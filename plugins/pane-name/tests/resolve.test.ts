import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildRows, resolve, type Snapshot } from "../src/resolve.ts";

const snapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/session.json", import.meta.url)), "utf8"),
) as Snapshot;

const paneIds = (result: ReturnType<typeof resolve>) =>
  result.status === "ambiguous" ? result.matches.map((pane) => pane.pane_id).sort() : [];

test("an exact pane id is the first thing returned", () => {
  const result = resolve("w1:p6", snapshot);
  assert.equal(result.status, "unique");
  assert.equal(result.tier, "pane-id");
  assert.equal(result.pane_id, "w1:p6");
});

test("an id-shaped query is never fuzzy-matched", () => {
  const result = resolve("w9:p9", snapshot);
  assert.equal(result.status, "none");
  assert.equal(result.tier, "pane-id");
  assert.equal(result.note, "no pane with id w9:p9");
});

test("exact pane label wins", () => {
  const result = resolve("reviewer", snapshot);
  assert.equal(result.status, "unique");
  assert.equal(result.tier, "exact-name");
  assert.equal(result.pane_id, "w1:p3");
});

test("exact agent name works too", () => {
  const result = resolve("code-reviewer", snapshot);
  assert.equal(result.status, "unique");
  assert.equal(result.tier, "exact-name");
  assert.equal(result.pane_id, "w1:p3");
});

test("matching is case-insensitive", () => {
  const result = resolve("REVIEWER", snapshot);
  assert.equal(result.status, "unique");
  assert.equal(result.pane_id, "w1:p3");
});

test("a partial name that matches two panes is refused", () => {
  const result = resolve("review", snapshot);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.tier, "partial-name");
  assert.equal(result.reason, "multiple-panes");
  assert.equal(result.count, 2);
  assert.deepEqual(paneIds(result), ["w1:p3", "w1:p6"]);
});

test("a tab name resolves when the tab holds one unnamed pane", () => {
  const result = resolve("docs", snapshot);
  assert.equal(result.status, "unique");
  assert.equal(result.tier, "tab-name");
  assert.equal(result.pane_id, "w1:p2");
  assert.deepEqual(result.pane.evidence, [{ field: "tab_label", mode: "exact", value: "docs" }]);
});

test("a tab name is refused when the tab holds several panes", () => {
  const result = resolve("extras", snapshot);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.tier, "tab-name");
  assert.equal(result.reason, "name-not-decisive");
  assert.deepEqual(paneIds(result), ["w1:p4", "w1:p5"]);
  assert.match(
    result.matches.find((pane) => pane.pane_id === "w1:p5")?.reason ?? "",
    /that tab holds 2 panes/,
  );
});

test("a tab name is refused when its single pane already has a different name", () => {
  const result = resolve("deploy", snapshot);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.tier, "tab-name");
  assert.deepEqual(paneIds(result), ["w1:p7"]);
  assert.match(result.matches[0]?.reason ?? "", /already named "ship-it"/);
});

test("a workspace name resolves when the workspace holds one unnamed pane", () => {
  const result = resolve("scratch", snapshot);
  assert.equal(result.status, "unique");
  assert.equal(result.tier, "workspace-name");
  assert.equal(result.pane_id, "w3:p1");
});

test("a tab name shared by two tabs is refused, even when only one tab is decisive", () => {
  const result = resolve("app", snapshot);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.tier, "tab-name");
  assert.equal(result.reason, "accepted-but-other-panes-match");
  assert.deepEqual(paneIds(result), ["w1:p1", "w1:p3", "w1:p6", "w2:p2"]);
});

test("--tab narrows a shared tab name to one pane", () => {
  const result = resolve("app", snapshot, { tab: "w2:t2" });
  assert.equal(result.status, "unique");
  assert.equal(result.pane_id, "w2:p2");
});

test("--workspace narrows a partial name", () => {
  const ambiguous = resolve("review", snapshot);
  assert.equal(ambiguous.status, "ambiguous");

  const narrowed = resolve("review", snapshot, { workspace: "w2" });
  assert.equal(narrowed.status, "none");
});

test("terminal title is a last resort tier", () => {
  const result = resolve("Build API refactor", snapshot);
  assert.equal(result.status, "unique");
  assert.equal(result.tier, "context");
  assert.equal(result.pane_id, "w1:p1");
});

test("a weak tier still refuses when it matches several panes", () => {
  const result = resolve("pi", snapshot);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.tier, "context");
  assert.ok(result.count > 1);
});

test("no match lists the names that do exist", () => {
  const result = resolve("zzz", snapshot);
  assert.equal(result.status, "none");
  assert.equal(result.tier, "none");
  assert.ok(result.available.some((pane) => pane.label === "reviewer"));
  assert.ok(result.available.some((pane) => pane.agent_name === "writer"));
});

test("evidence records which field matched and how", () => {
  const result = resolve("notes", snapshot);
  assert.equal(result.status, "unique");
  assert.deepEqual(result.pane.evidence, [{ field: "label", mode: "exact", value: "notes" }]);

  const partial = resolve("ship", snapshot);
  assert.equal(partial.status, "unique");
  assert.deepEqual(partial.pane.evidence, [{ field: "label", mode: "partial", value: "ship-it" }]);
});

test("pane counts are exposed for tab-scoped reasoning", () => {
  const rows = buildRows(snapshot);
  const byId = new Map(rows.map((row) => [row.pane_id, row]));
  assert.equal(byId.get("w1:p1")?.panes_in_tab, 3);
  assert.equal(byId.get("w1:p2")?.panes_in_tab, 1);
  assert.equal(byId.get("w3:p1")?.panes_in_workspace, 1);
  assert.equal(byId.get("w1:p1")?.dir, "app");
  assert.equal(byId.get("w1:p3")?.agent_name, "code-reviewer");
});

test("an empty session resolves to no match without crashing", () => {
  const result = resolve("anything", { panes: [], agents: [], tabs: [], workspaces: [] });
  assert.equal(result.status, "none");
  assert.deepEqual(result.available, []);
});

test("a pane with no agent entry still resolves by label", () => {
  const result = resolve("ship-it", snapshot);
  assert.equal(result.status, "unique");
  assert.equal(result.pane_id, "w1:p7");
  assert.equal(result.pane.agent_name, null);
});
