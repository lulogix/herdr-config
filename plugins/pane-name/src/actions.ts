/**
 * Send / rename logic. Takes a Snapshot and a Runner instead of calling Herdr
 * directly, so the refusal rules are testable without a live Herdr session.
 */
import type { ResolveResult, Snapshot, Tier } from "./resolve.ts";
import { resolve, type Filters } from "./resolve.ts";
import type { RunResult, Runner } from "./runner.ts";

export interface SendOptions {
  /** Wait for the agent to return to idle before returning. */
  wait?: boolean;
  /** Read this many lines of agent output after sending. */
  read?: number | null;
  /** Send as a shell command instead of an agent prompt. */
  asCommand?: boolean;
}

export type SendOutcome =
  | {
      outcome: "sent";
      pane_id: string;
      tier: Tier;
      mode: "agent-prompt" | "pane-run";
      commands: string[][];
      response: RunResult;
      output: string | null;
    }  | { outcome: "failed"; pane_id: string; tier: Tier; mode: "agent-prompt" | "pane-run"; response: RunResult }
  | { outcome: "refused"; reason: "ambiguous" | "no-match"; result: ResolveResult };

/** A pane hosts an agent when Herdr reports an agent kind for it. */
export function hostsAgent(pane: { agent_kind: string | null }): boolean {
  return pane.agent_kind !== null;
}

export function sendToPane(
  query: string,
  message: string,
  options: SendOptions,
  snapshot: Snapshot,
  runner: Runner,
  filters: Filters = {},
): SendOutcome {
  const result = resolve(query, snapshot, filters);

  if (result.status === "ambiguous") return { outcome: "refused", reason: "ambiguous", result };
  if (result.status === "none") return { outcome: "refused", reason: "no-match", result };

  const pane = result.pane;
  const useAgent = !options.asCommand && hostsAgent(pane);

  const promptArgs: string[] = useAgent
    ? ["agent", "prompt", pane.pane_id, message, ...(options.wait ? ["--wait"] : [])]
    : ["pane", "run", pane.pane_id, message];

  const readArgs: string[] | null =
    options.read && options.read > 0
      ? ["agent", "read", pane.pane_id, "--source", "recent-unwrapped", "--lines", String(options.read)]
      : null;

  const response = runner.run(promptArgs);
  if (!response.ok) {
    return { outcome: "failed", pane_id: pane.pane_id, tier: result.tier, mode: useAgent ? "agent-prompt" : "pane-run", response };
  }

  let output: string | null = null;
  if (readArgs) {
    const read = runner.run(readArgs);
    output = read.ok ? read.stdout : null;
  }

  return {
    outcome: "sent",
    pane_id: pane.pane_id,
    tier: result.tier,
    mode: useAgent ? "agent-prompt" : "pane-run",
    commands: readArgs ? [promptArgs, readArgs] : [promptArgs],
    response,
    output,
  };
}

export type RenameOutcome =
  | { outcome: "renamed"; pane_id: string; tier: Tier; label: string | null; response: RunResult }
  | { outcome: "refused"; reason: "ambiguous" | "no-match"; result: ResolveResult };

export function renamePane(
  query: string,
  label: string | null,
  snapshot: Snapshot,
  runner: Runner,
  filters: Filters = {},
): RenameOutcome {
  const result = resolve(query, snapshot, filters);

  if (result.status === "ambiguous") return { outcome: "refused", reason: "ambiguous", result };
  if (result.status === "none") return { outcome: "refused", reason: "no-match", result };

  const pane_id = result.pane.pane_id;
  const args = label === null ? ["pane", "rename", pane_id, "--clear"] : ["pane", "rename", pane_id, label];
  const response = runner.run(args);

  return { outcome: "renamed", pane_id, tier: result.tier, label, response };
}
