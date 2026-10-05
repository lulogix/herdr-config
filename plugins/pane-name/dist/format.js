const pad = (value, width) => (value.length >= width ? value : value + " ".repeat(width - value.length));
function describe(pane) {
    const name = pane.label ?? "(unnamed)";
    const agent = `${pane.agent_name ?? "(unnamed)"}/${pane.agent_kind ?? "none"}`;
    const state = pane.agent_status ?? "unknown";
    const tab = pane.tab_label ?? pane.tab_id;
    const workspace = pane.workspace_label ?? pane.workspace_id;
    const matched = pane.evidence.map((e) => `${e.value} via ${e.field} ${e.mode}`).join(", ");
    const line = `  ${pad(pane.pane_id, 8)} name=${name}  agent=${agent}  state=${state}  tab=${tab}  workspace=${workspace}  matched=${matched}`;
    return pane.reason ? `${line}\n      -> ${pane.reason}` : line;
}
export function formatResolve(result) {
    if (result.status === "unique") {
        return `unique: ${result.pane_id}  [tier: ${result.tier}]\n${describe(result.pane)}`;
    }
    if (result.status === "ambiguous") {
        const phrase = result.count === 1 ? "pane matches" : "panes match";
        return [
            `${result.count} ${phrase} "${result.query}" [tier: ${result.tier}] - nothing was chosen:`,
            ...result.matches.map(describe),
            "",
            "Make it decisive:",
            "  herdr pane rename <pane_id> <name>",
            "  ... or narrow the search: --workspace <id|label> / --tab <id|label>",
        ].join("\n");
    }
    const header = `no pane matches "${result.query}"${result.note ? ` (${result.note})` : ""}. Named panes in this session:`;
    if (result.available.length === 0)
        return `${header}\n  (none - every pane is unnamed)`;
    return [
        header,
        ...result.available.map((pane) => `  ${pad(pane.pane_id, 8)} name=${pane.label ?? "-"}  agent=${pane.agent_name ?? "-"}`),
    ].join("\n");
}
export function formatNames(rows) {
    if (rows.length === 0)
        return "no panes in this session";
    const header = `  ${pad("pane", 8)} ${pad("pane label", 22)} ${pad("agent name", 18)} ${pad("tab", 18)} ${pad("workspace", 16)} state`;
    const lines = rows.map((pane) => `  ${pad(pane.pane_id, 8)} ${pad(pane.label ?? "-", 22)} ${pad(pane.agent_name ?? "-", 18)} ${pad(pane.tab_label ?? pane.tab_id, 18)} ${pad(pane.workspace_label ?? pane.workspace_id, 16)} ${pane.agent_status ?? "unknown"}`);
    const unnamed = rows.filter((pane) => pane.label === null);
    const byTab = rows.filter((pane) => pane.label === null && pane.panes_in_tab === 1 && pane.tab_label !== null);
    return [
        header,
        ...lines,
        "",
        `${rows.length} pane(s): ${rows.length - unnamed.length} named, ${unnamed.length} unnamed.`,
        unnamed.length > 0
            ? `${byTab.length} unnamed pane(s) are addressable by tab name; ${unnamed.length - byTab.length} need a name:\n  herdr pane rename <pane_id> <name>`
            : "every pane has a name.",
    ].join("\n");
}
