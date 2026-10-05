/**
 * The only place that talks to Herdr. Everything else takes a Runner, so tests
 * can substitute a fake and assert exactly which commands would have run.
 */
import { spawnSync } from "node:child_process";
export function herdrBinary() {
    return process.env.HERDR_BIN_PATH || "herdr";
}
export const realRunner = {
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
export class SnapshotError extends Error {
}
function parse(result, label) {
    if (!result.ok) {
        throw new SnapshotError(`${label} failed: ${(result.stderr || result.stdout).trim()}`);
    }
    try {
        return JSON.parse(result.stdout);
    }
    catch {
        throw new SnapshotError(`${label} returned unreadable JSON`);
    }
}
export function buildSnapshot(runner) {
    const agents = parse(runner.run(["agent", "list"]), "herdr agent list");
    const panes = parse(runner.run(["pane", "list"]), "herdr pane list");
    const tabs = parse(runner.run(["tab", "list"]), "herdr tab list");
    const workspaces = parse(runner.run(["workspace", "list"]), "herdr workspace list");
    return {
        agents: agents.result?.agents ?? [],
        panes: panes.result?.panes ?? [],
        tabs: tabs.result?.tabs ?? [],
        workspaces: workspaces.result?.workspaces ?? [],
    };
}
