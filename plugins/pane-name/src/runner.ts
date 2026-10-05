/**
 * The only place that talks to Herdr. Everything else takes a Runner, so tests
 * can substitute a fake and assert exactly which commands would have run.
 */
import { spawnSync } from "node:child_process";
import type { AgentInput, PaneInput, Snapshot, TabInput, WorkspaceInput } from "./resolve.ts";

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export interface Runner {
  run(args: string[]): RunResult;
}

export function herdrBinary(): string {
  return process.env.HERDR_BIN_PATH || "herdr";
}

export const realRunner: Runner = {
  run(args) {
    const result = spawnSync(herdrBinary(), args, { encoding: "utf8" });
    if (result.error) {
      return { ok: false, stdout: "", stderr: String(result.error.message ?? result.error) };
    }
    return {
      ok: result.status === 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  },
};

export class SnapshotError extends Error {}

function parse<T>(result: RunResult, label: string): T {
  if (!result.ok) {
    throw new SnapshotError(`${label} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new SnapshotError(`${label} returned unreadable JSON`);
  }
}

export function buildSnapshot(runner: Runner): Snapshot {
  const agents = parse<{ result?: { agents?: AgentInput[] } }>(runner.run(["agent", "list"]), "herdr agent list");
  const panes = parse<{ result?: { panes?: PaneInput[] } }>(runner.run(["pane", "list"]), "herdr pane list");
  const tabs = parse<{ result?: { tabs?: TabInput[] } }>(runner.run(["tab", "list"]), "herdr tab list");
  const workspaces = parse<{ result?: { workspaces?: WorkspaceInput[] } }>(
    runner.run(["workspace", "list"]),
    "herdr workspace list",
  );

  return {
    agents: agents.result?.agents ?? [],
    panes: panes.result?.panes ?? [],
    tabs: tabs.result?.tabs ?? [],
    workspaces: workspaces.result?.workspaces ?? [],
  };
}
