#!/usr/bin/env node
/**
 * pane-name: address Herdr panes by name instead of pane id.
 *
 *   resolve <name>            who does this name refer to?
 *   send <name> <message..>   prompt that pane, refusing when the name is ambiguous
 *   names                     every addressable name in the session
 *   rename <name> <label>     give a pane a name (or --clear)
 *   picker                    interactive search-and-send in a popup pane
 *
 * Exit codes: 0 ok, 2 bad arguments, 3 ambiguous, 4 no match, 5 Herdr call failed.
 */
import * as readline from "node:readline";
import { renamePane, sendToPane } from "./actions.ts";
import { formatNames, formatResolve } from "./format.ts";
import { buildRows, resolve, type Filters } from "./resolve.ts";
import { buildSnapshot, realRunner, SnapshotError, type Runner } from "./runner.ts";

const EXIT = { ok: 0, usage: 2, ambiguous: 3, noMatch: 4, herdrFailed: 5 } as const;

const USAGE = `usage:
  pane-name resolve [--json] [--workspace <id|label>] [--tab <id|label>] <query>
  pane-name send    [--json] [--wait] [--read <n>] [--cmd] [--workspace <id|label>] [--tab <id|label>] <query> <message...>
  pane-name names   [--json]
  pane-name rename  <name> <label|--clear>
  pane-name picker

Exit codes: 0 ok, 2 usage, 3 ambiguous, 4 no match, 5 Herdr call failed.`;

interface Options {
  json: boolean;
  workspace?: string;
  tab?: string;
  wait: boolean;
  read: number | null;
  cmd: boolean;
  clear: boolean;
  positional: string[];
}

function parseArgs(argv: string[]): Options {
  const options: Options = { json: false, wait: false, read: null, cmd: false, clear: false, positional: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--json") options.json = true;
    else if (arg === "--wait") options.wait = true;
    else if (arg === "--cmd") options.cmd = true;
    else if (arg === "--clear") options.clear = true;
    else if (arg === "--workspace") options.workspace = argv[++i] ?? "";
    else if (arg === "--tab") options.tab = argv[++i] ?? "";
    else if (arg === "--read") options.read = Number.parseInt(argv[++i] ?? "", 10) || null;
    else if (arg === "-h" || arg === "--help") throw new UsageError();
    else if (arg.startsWith("-")) throw new UsageError(`unknown option ${arg}`);
    else options.positional.push(arg);
  }

  return options;
}

class UsageError extends Error {
  constructor(message?: string) {
    super(message ?? "bad arguments");
  }
}

function filters(options: { workspace?: string | undefined; tab?: string | undefined }): Filters {
  const result: Filters = {};
  if (options.workspace) result.workspace = options.workspace;
  if (options.tab) result.tab = options.tab;
  return result;
}

function exitFor(status: string): number {
  if (status === "unique" || status === "sent" || status === "renamed") return EXIT.ok;
  if (status === "ambiguous") return EXIT.ambiguous;
  if (status === "no-match" || status === "none") return EXIT.noMatch;
  return EXIT.herdrFailed;
}

async function picker(runner: Runner): Promise<number> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt: string) => new Promise<string>((done) => rl.question(prompt, done));

  for (;;) {
    let snapshot;
    try {
      snapshot = buildSnapshot(runner);
    } catch (error) {
      console.error(String((error as Error).message));
      break;
    }

    const rows = buildRows(snapshot);
    console.log(formatNames(rows));

    const name = (await ask("\npane name (q quits): ")).trim();
    if (name === "q" || name === "") {
      if (name === "q") break;
      continue;
    }

    const result = resolve(name, snapshot, {});
    console.log(formatResolve(result));
    if (result.status !== "unique") continue;

    const message = (await ask(`message to ${result.pane_id}: `)).trim();
    if (!message) continue;

    const outcome = sendToPane(name, message, { wait: false, read: null, asCommand: false }, snapshot, runner);
    if (outcome.outcome === "refused") {
      console.log(formatResolve(outcome.result));
    } else if (outcome.outcome === "sent") {
      console.log(`sent to ${outcome.pane_id} via ${outcome.mode}`);
    } else {
      console.error(`send failed: ${outcome.response.stderr || outcome.response.stdout}`);
    }
  }

  rl.close();
  return EXIT.ok;
}

async function main(argv: string[]): Promise<number> {
  const command = argv[0];
  if (command === undefined || command === "-h" || command === "--help" || command === "help") {
    process.stdout.write(USAGE);
    return 0;
  }

  let options: Options;
  try {
    options = parseArgs(argv.slice(1));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`${error.message}\n\n${USAGE}`);
      return EXIT.usage;
    }
    throw error;
  }

  if (command === "picker") return picker(realRunner);

  if (command === "names") {
    const snapshot = buildSnapshot(realRunner);
    if (options.json) {
      console.log(JSON.stringify(buildRows(snapshot)));
    } else {
      console.log(formatNames(buildRows(snapshot)));
    }
    return EXIT.ok;
  }

  const query = options.positional[0];
  if (!query) {
    console.error(USAGE);
    return EXIT.usage;
  }

  const snapshot = buildSnapshot(realRunner);

  if (command === "resolve") {
    const result = resolve(query, snapshot, filters(options));
    if (options.json) console.log(JSON.stringify(result));
    else console.log(formatResolve(result));
    return exitFor(result.status);
  }

  if (command === "send") {
    const message = options.positional.slice(1).join(" ").trim();
    if (!message) {
      console.error(`send needs a message\n\n${USAGE}`);
      return EXIT.usage;
    }
    const outcome = sendToPane(
      query,
      message,
      { wait: options.wait, read: options.read, asCommand: options.cmd },
      snapshot,
      realRunner,
      filters(options),
    );
    if (options.json) console.log(JSON.stringify(outcome));
    else if (outcome.outcome === "refused") console.log(formatResolve(outcome.result));
    else if (outcome.outcome === "sent") {
      console.log(`sent to ${outcome.pane_id} via ${outcome.mode} [tier: ${outcome.tier}]`);
      if (outcome.output) console.log(outcome.output.replace(/^/gm, "  "));
    } else {
      console.error(`send failed: ${outcome.response.stderr || outcome.response.stdout}`);
    }
    return exitFor(outcome.outcome === "refused" ? outcome.reason : outcome.outcome);
  }

  if (command === "rename") {
    const label = options.clear ? null : options.positional[1];
    if (!label && !options.clear) {
      console.error(`rename needs a label or --clear\n\n${USAGE}`);
      return EXIT.usage;
    }
    const outcome = renamePane(query, label ?? null, snapshot, realRunner, filters(options));
    if (outcome.outcome === "refused") console.log(formatResolve(outcome.result));
    else if (outcome.response.ok) {
      console.log(`${outcome.pane_id} -> ${outcome.label ?? "(unnamed)"}`);
    } else {
      console.error(`rename failed: ${outcome.response.stderr || outcome.response.stdout}`);
      return EXIT.herdrFailed;
    }
    return exitFor(outcome.outcome === "refused" ? outcome.reason : outcome.outcome);
  }

  console.error(`unknown command ${command}\n\n${USAGE}`);
  return EXIT.usage;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    if (error instanceof SnapshotError) {
      console.error(String(error.message));
      process.exitCode = EXIT.herdrFailed;
      return;
    }
    console.error(`pane-name: ${String((error as Error).message ?? error)}`);
    process.exitCode = EXIT.herdrFailed;
  });
