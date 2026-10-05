/**
 * Pure name -> pane resolution. No I/O, no Herdr calls: everything it needs is a
 * snapshot of session state, which is why it can be unit tested.
 *
 * Tiers, tried in order. The first tier that matches anything decides the answer.
 *
 *   0 pane-id          query is exactly a pane id (w1:p6) - returned as-is
 *   1 exact-name       pane label or agent name, case-insensitive equality
 *   2 partial-name     substring of a pane label or agent name
 *   3 tab-name         tab label, accepted only for the single unnamed pane in it
 *   4 workspace-name   workspace label, accepted only for the single unnamed pane
 *   5 context          terminal title, directory basename, agent kind, display agent
 *
 * A tier yields accepted rows (safe to address) and rejected rows (matched the
 * name, but not decisively). A tier counts as a hit if either list is non-empty,
 * so a tab-name match over three panes reports ambiguity instead of quietly
 * falling through to a weaker tier.
 */

export interface PaneInput {
  pane_id: string;
  tab_id: string;
  workspace_id: string;
  label?: string | null;
  title?: string | null;
  display_agent?: string | null;
  agent?: string | null;
  agent_status?: string | null;
  terminal_title?: string | null;
  terminal_title_stripped?: string | null;
  cwd?: string | null;
}

export interface AgentInput {
  pane_id: string;
  name?: string | null;
  agent?: string | null;
  agent_status?: string | null;
}

export interface TabInput {
  tab_id: string;
  label?: string | null;
  workspace_id?: string;
}

export interface WorkspaceInput {
  workspace_id: string;
  label?: string | null;
}

export interface Snapshot {
  panes: PaneInput[];
  agents: AgentInput[];
  tabs: TabInput[];
  workspaces: WorkspaceInput[];
}

export interface Filters {
  workspace?: string;
  tab?: string;
}

export type Field =
  | "pane_id"
  | "label"
  | "agent_name"
  | "tab_label"
  | "workspace_label"
  | "terminal_title"
  | "title"
  | "dir"
  | "display_agent"
  | "agent_kind";

export interface PaneRef {
  pane_id: string;
  workspace_id: string;
  tab_id: string;
  label: string | null;
  title: string | null;
  display_agent: string | null;
  agent_name: string | null;
  agent_kind: string | null;
  agent_status: string | null;
  terminal_title: string | null;
  tab_label: string | null;
  workspace_label: string | null;
  cwd: string | null;
  dir: string | null;
  panes_in_tab: number;
  panes_in_workspace: number;
}

export interface MatchedPane extends PaneRef {
  evidence: Evidence[];
  reason?: string;
}

export interface Evidence {
  field: Field;
  mode: "exact" | "partial";
  value: string;
}

export type Tier =
  | "pane-id"
  | "exact-name"
  | "partial-name"
  | "tab-name"
  | "workspace-name"
  | "context"
  | "none";

export type ResolveResult =
  | { status: "unique"; query: string; tier: Tier; pane_id: string; pane: MatchedPane }
  | {
      status: "ambiguous";
      query: string;
      tier: Tier;
      reason: "multiple-panes" | "name-not-decisive" | "accepted-but-other-panes-match";
      count: number;
      matches: MatchedPane[];
    }
  | {
      status: "none";
      query: string;
      tier: Tier;
      note?: string;
      available: {
        pane_id: string;
        label: string | null;
        agent_name: string | null;
        tab_label: string | null;
        workspace_label: string | null;
      }[];
    };

const norm = (value: string | null | undefined): string => (value ?? "").toString().toLowerCase();

/** Pane ids look like `w1:p6`. Anything of that shape is an id, never a fuzzy query. */
const ID_SHAPE = /^[a-z0-9_-]+:[a-z0-9_-]+$/;

interface TierSpec {
  tier: Exclude<Tier, "pane-id" | "none">;
  fields: Field[];
  kind: "exact" | "partial" | "both";
  guard?: "sole_unnamed";
  scope?: "panes_in_tab" | "panes_in_workspace";
}

const TIERS: TierSpec[] = [
  { tier: "exact-name", fields: ["label", "agent_name"], kind: "exact" },
  { tier: "partial-name", fields: ["label", "agent_name"], kind: "partial" },
  { tier: "tab-name", fields: ["tab_label"], kind: "both", guard: "sole_unnamed", scope: "panes_in_tab" },
  { tier: "workspace-name", fields: ["workspace_label"], kind: "both", guard: "sole_unnamed", scope: "panes_in_workspace" },
  {
    tier: "context",
    fields: ["terminal_title", "title", "dir", "display_agent", "agent_kind"],
    kind: "partial",
  },
];

function fieldOf(pane: PaneRef, field: Field): string {
  switch (field) {
    case "pane_id":
      return pane.pane_id;
    case "label":
      return pane.label ?? "";
    case "agent_name":
      return pane.agent_name ?? "";
    case "tab_label":
      return pane.tab_label ?? "";
    case "workspace_label":
      return pane.workspace_label ?? "";
    case "terminal_title":
      return pane.terminal_title ?? "";
    case "title":
      return pane.title ?? "";
    case "dir":
      return pane.dir ?? "";
    case "display_agent":
      return pane.display_agent ?? "";
    case "agent_kind":
      return pane.agent_kind ?? "";
  }
}

function hits(pane: PaneRef, field: Field, query: string, kind: TierSpec["kind"]): boolean {
  const value = norm(fieldOf(pane, field));
  if (value === "") return false;
  if (kind === "exact") return value === query;
  if (kind === "partial") return value.includes(query);
  return value === query || value.includes(query);
}

function evidenceFor(pane: PaneRef, fields: Field[], query: string): Evidence[] {
  const found: Evidence[] = [];
  for (const field of fields) {
    const raw = fieldOf(pane, field);
    const value = norm(raw);
    if (value === "") continue;
    if (value === query) found.push({ field, mode: "exact", value: raw });
    else if (value.includes(query)) found.push({ field, mode: "partial", value: raw });
  }
  return found;
}

export function buildRows(snapshot: Snapshot): PaneRef[] {
  const agentByPane = new Map<string, AgentInput>();
  for (const agent of snapshot.agents) {
    if (agent.pane_id) agentByPane.set(agent.pane_id, agent);
  }

  const tabById = new Map<string, TabInput>();
  for (const tab of snapshot.tabs) tabById.set(tab.tab_id, tab);

  const workspaceById = new Map<string, WorkspaceInput>();
  for (const workspace of snapshot.workspaces) workspaceById.set(workspace.workspace_id, workspace);

  const tabCounts = new Map<string, number>();
  const workspaceCounts = new Map<string, number>();
  for (const pane of snapshot.panes) {
    tabCounts.set(pane.tab_id, (tabCounts.get(pane.tab_id) ?? 0) + 1);
    workspaceCounts.set(pane.workspace_id, (workspaceCounts.get(pane.workspace_id) ?? 0) + 1);
  }

  return snapshot.panes.map((pane) => {
    const agent = agentByPane.get(pane.pane_id);
    const tab = tabById.get(pane.tab_id);
    const workspace = workspaceById.get(pane.workspace_id);
    const cwd = pane.cwd ?? null;
    return {
      pane_id: pane.pane_id,
      workspace_id: pane.workspace_id,
      tab_id: pane.tab_id,
      label: pane.label ?? null,
      title: pane.title ?? null,
      display_agent: pane.display_agent ?? null,
      agent_name: agent?.name ?? null,
      agent_kind: pane.agent ?? agent?.agent ?? null,
      agent_status: pane.agent_status ?? agent?.agent_status ?? null,
      terminal_title: pane.terminal_title_stripped ?? pane.terminal_title ?? null,
      tab_label: tab?.label ?? null,
      workspace_label: workspace?.label ?? null,
      cwd,
      dir: cwd ? (cwd.split("/").filter(Boolean).pop() ?? null) : null,
      panes_in_tab: tabCounts.get(pane.tab_id) ?? 1,
      panes_in_workspace: workspaceCounts.get(pane.workspace_id) ?? 1,
    };
  });
}

function applyFilters(rows: PaneRef[], filters: Filters): PaneRef[] {
  let result = rows;

  const workspace = norm(filters.workspace);
  if (workspace) {
    result = result.filter(
      (pane) =>
        norm(pane.workspace_id) === workspace ||
        norm(pane.workspace_label) === workspace ||
        norm(pane.workspace_label).includes(workspace),
    );
  }

  const tab = norm(filters.tab);
  if (tab) {
    result = result.filter(
      (pane) =>
        norm(pane.tab_id) === tab ||
        norm(pane.tab_label) === tab ||
        norm(pane.tab_label).includes(tab),
    );
  }

  return result;
}

function runTier(rows: PaneRef[], spec: TierSpec, query: string): { accepted: MatchedPane[]; rejected: MatchedPane[] } {
  const matched = rows.filter((pane) => spec.fields.some((field) => hits(pane, field, query, spec.kind)));

  if (spec.guard !== "sole_unnamed") {
    return { accepted: matched.map((pane) => ({ ...pane, evidence: evidenceFor(pane, spec.fields, query) })), rejected: [] };
  }

  const scope = spec.scope ?? "panes_in_tab";
  const scopeLabel = scope === "panes_in_tab" ? "tab" : "workspace";
  const accepted: MatchedPane[] = [];
  const rejected: MatchedPane[] = [];

  for (const pane of matched) {
    const count = scope === "panes_in_tab" ? pane.panes_in_tab : pane.panes_in_workspace;
    const evidence = evidenceFor(pane, spec.fields, query);
    if (pane.label === null && count === 1) {
      accepted.push({ ...pane, evidence });
    } else if (pane.label !== null) {
      rejected.push({
        ...pane,
        evidence,
        reason: `matched the ${scopeLabel} name, but this pane is already named "${pane.label}"`,
      });
    } else {
      rejected.push({
        ...pane,
        evidence,
        reason: `matched the ${scopeLabel} name, but that ${scopeLabel} holds ${count} panes`,
      });
    }
  }

  return { accepted, rejected };
}

export function resolve(query: string, snapshot: Snapshot, filters: Filters = {}): ResolveResult {
  const q = norm(query);
  const rows = applyFilters(buildRows(snapshot), filters);

  const byId = rows.find((pane) => norm(pane.pane_id) === q);
  if (byId) {
    return {
      status: "unique",
      query,
      tier: "pane-id",
      pane_id: byId.pane_id,
      pane: { ...byId, evidence: [{ field: "pane_id", mode: "exact", value: byId.pane_id }] },
    };
  }

  // An id-shaped query is never fuzzy-matched: a missing id is a plain no-match.
  if (ID_SHAPE.test(q)) {
    return { status: "none", query, tier: "pane-id", note: `no pane with id ${query}`, available: availableNames(rows) };
  }

  for (const spec of TIERS) {
    const { accepted, rejected } = runTier(rows, spec, q);
    if (accepted.length === 0 && rejected.length === 0) continue;

    if (accepted.length === 1 && rejected.length === 0) {
      const only = accepted[0] as MatchedPane;
      return { status: "unique", query, tier: spec.tier, pane_id: only.pane_id, pane: only };
    }
    if (accepted.length > 1) {
      return {
        status: "ambiguous",
        query,
        tier: spec.tier,
        reason: "multiple-panes",
        count: accepted.length,
        matches: accepted,
      };
    }
    const matches = [...accepted, ...rejected];
    return {
      status: "ambiguous",
      query,
      tier: spec.tier,
      reason: accepted.length === 1 ? "accepted-but-other-panes-match" : "name-not-decisive",
      count: matches.length,
      matches,
    };
  }

  return { status: "none", query, tier: "none", available: availableNames(rows) };
}

function availableNames(rows: PaneRef[]) {
  return rows
    .filter((pane) => pane.label !== null || pane.agent_name !== null)
    .map((pane) => ({
      pane_id: pane.pane_id,
      label: pane.label,
      agent_name: pane.agent_name,
      tab_label: pane.tab_label,
      workspace_label: pane.workspace_label,
    }));
}
