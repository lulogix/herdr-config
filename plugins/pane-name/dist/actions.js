import { resolve } from "./resolve.js";
/** A pane hosts an agent when Herdr reports an agent kind for it. */
export function hostsAgent(pane) {
    return pane.agent_kind !== null;
}
export function sendToPane(query, message, options, snapshot, runner, filters = {}) {
    const result = resolve(query, snapshot, filters);
    if (result.status === "ambiguous")
        return { outcome: "refused", reason: "ambiguous", result };
    if (result.status === "none")
        return { outcome: "refused", reason: "no-match", result };
    const pane = result.pane;
    const useAgent = !options.asCommand && hostsAgent(pane);
    const promptArgs = useAgent
        ? ["agent", "prompt", pane.pane_id, message, ...(options.wait ? ["--wait"] : [])]
        : ["pane", "run", pane.pane_id, message];
    const readArgs = options.read && options.read > 0
        ? ["agent", "read", pane.pane_id, "--source", "recent-unwrapped", "--lines", String(options.read)]
        : null;
    const response = runner.run(promptArgs);
    if (!response.ok) {
        return { outcome: "failed", pane_id: pane.pane_id, tier: result.tier, mode: useAgent ? "agent-prompt" : "pane-run", response };
    }
    let output = null;
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
export function renamePane(query, label, snapshot, runner, filters = {}) {
    const result = resolve(query, snapshot, filters);
    if (result.status === "ambiguous")
        return { outcome: "refused", reason: "ambiguous", result };
    if (result.status === "none")
        return { outcome: "refused", reason: "no-match", result };
    const pane_id = result.pane.pane_id;
    const args = label === null ? ["pane", "rename", pane_id, "--clear"] : ["pane", "rename", pane_id, label];
    const response = runner.run(args);
    return { outcome: "renamed", pane_id, tier: result.tier, label, response };
}
