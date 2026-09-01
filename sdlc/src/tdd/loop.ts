import * as path from "node:path";
import type { BddFeature, SpecDocument, TddLoopEntry, TddPhase } from "../types.js";
import { nowIso, pathExists, readText, writeText } from "../util.js";

export type TddEvent = "write-red" | "confirm-red" | "go-green" | "refactor" | "finish";

/** Derive the canonical test file for a requirement. */
export function testFileFor(spec: SpecDocument, requirementId: string): string {
  return path.posix.join("tests", "sdlc", spec.slug, `${requirementId}.test.ts`);
}

/** Initialise the loop: one entry per requirement, all starting at "red". */
export function initLoop(spec: SpecDocument, features: BddFeature[] = []): TddLoopEntry[] {
  const featureByReq = new Map<string, string>();
  for (const f of features) for (const id of f.requirementIds) featureByReq.set(id, `${f.capability}.feature`);

  return spec.requirements.map((req) => ({
    requirementId: req.id,
    phase: "red" as TddPhase,
    testFile: testFileFor(spec, req.id),
    featureFile: featureByReq.get(req.id),
    notes: [],
  }));
}

const VALID: Record<TddEvent, TddPhase[]> = {
  "write-red": ["red"],
  "confirm-red": ["red"],
  "go-green": ["red"],
  refactor: ["green"],
  finish: ["green", "refactor"],
};

/**
 * Advance a single requirement through the red→green→refactor→done loop.
 * Enforces TDD discipline: you cannot go green before a failing test exists.
 */
export function applyEvent(entry: TddLoopEntry, event: TddEvent, at: string = nowIso()): TddLoopEntry {
  if (!VALID[event].includes(entry.phase)) {
    throw new Error(`Cannot apply "${event}" to ${entry.requirementId} in phase "${entry.phase}"`);
  }
  const next: TddLoopEntry = { ...entry, notes: [...entry.notes] };

  switch (event) {
    case "write-red":
    case "confirm-red":
      next.redAt = at;
      next.phase = "red";
      next.notes.push(`${at} red: failing test recorded`);
      break;
    case "go-green":
      if (!next.redAt) throw new Error(`${entry.requirementId}: refusing to go green before a red test exists`);
      next.greenAt = at;
      next.phase = "green";
      next.notes.push(`${at} green: implementation makes the test pass`);
      break;
    case "refactor":
      next.phase = "refactor";
      next.notes.push(`${at} refactor: cleaning up with tests green`);
      break;
    case "finish":
      if (!next.greenAt) throw new Error(`${entry.requirementId}: cannot finish before green`);
      next.phase = "done";
      next.notes.push(`${at} done`);
      break;
  }
  return next;
}

export function loopComplete(entries: TddLoopEntry[]): boolean {
  return entries.length > 0 && entries.every((e) => e.phase === "done");
}

export interface NextAction {
  requirementId: string;
  action: string;
}

/** Tell the agent what to do next for each requirement that is not done. */
export function nextActions(entries: TddLoopEntry[]): NextAction[] {
  return entries
    .filter((e) => e.phase !== "done")
    .map((e) => {
      if (e.phase === "red" && !e.redAt) {
        return { requirementId: e.requirementId, action: `Write a failing test in ${e.testFile}` };
      }
      if (e.phase === "red") return { requirementId: e.requirementId, action: `Implement to pass ${e.testFile}` };
      if (e.phase === "green") return { requirementId: e.requirementId, action: `Refactor or finish ${e.requirementId}` };
      return { requirementId: e.requirementId, action: `Finish ${e.requirementId}` };
    });
}

export function renderLoopReport(spec: SpecDocument, entries: TddLoopEntry[]): string {
  const rows = entries
    .map(
      (e) =>
        `| ${e.requirementId} | ${phaseBadge(e.phase)} | \`${e.testFile}\` | ${e.featureFile ? `\`${e.featureFile}\`` : "—"} |`,
    )
    .join("\n");
  const done = entries.filter((e) => e.phase === "done").length;

  return `# TDD loop — spec ${spec.id} "${spec.title}"

Progress: ${done}/${entries.length} requirements done${loopComplete(entries) ? " ✅" : ""}

| Requirement | Phase | Test | Feature |
| --- | --- | --- | --- |
${rows || "| _none_ | | | |"}
`;
}

function phaseBadge(phase: TddPhase): string {
  return { red: "🔴 red", green: "🟢 green", refactor: "🟡 refactor", done: "✅ done" }[phase];
}

export async function writeLoopState(file: string, entries: TddLoopEntry[]): Promise<string> {
  await writeText(file, `${JSON.stringify(entries, null, 2)}\n`);
  return file;
}

export async function readLoopState(file: string): Promise<TddLoopEntry[]> {
  if (!(await pathExists(file))) return [];
  return JSON.parse(await readText(file)) as TddLoopEntry[];
}
