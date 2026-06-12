import { describe, expect, it } from "vitest";
import { initLoop, applyEvent, loopComplete, nextActions, testFileFor } from "../src/tdd/loop.js";
import { generateFeatures } from "../src/bdd/featureGen.js";
import { sampleSpec } from "./fixtures.js";

describe("TDD red/green loop", () => {
  const spec = sampleSpec();

  it("seeds one red entry per requirement", () => {
    const loop = initLoop(spec, generateFeatures(spec));
    expect(loop).toHaveLength(spec.requirements.length);
    expect(loop.every((e) => e.phase === "red")).toBe(true);
    expect(loop[0].testFile).toBe(testFileFor(spec, loop[0].requirementId));
    expect(loop.find((e) => e.requirementId === "FR-002")?.featureFile).toBe("visualization.feature");
  });

  it("walks red → green → finish", () => {
    let entry = initLoop(spec)[0];
    entry = applyEvent(entry, "write-red", "t0");
    expect(entry.redAt).toBe("t0");
    entry = applyEvent(entry, "go-green", "t1");
    expect(entry.phase).toBe("green");
    entry = applyEvent(entry, "finish", "t2");
    expect(entry.phase).toBe("done");
  });

  it("refuses to go green before a red test exists", () => {
    const entry = initLoop(spec)[0];
    expect(() => applyEvent(entry, "go-green")).toThrow(/before a red test/);
  });

  it("refuses to finish before green", () => {
    const entry = applyEvent(initLoop(spec)[0], "write-red");
    expect(() => applyEvent(entry, "finish")).toThrow(/in phase/);
  });

  it("reports next actions and completion", () => {
    let loop = initLoop(spec);
    expect(loopComplete(loop)).toBe(false);
    expect(nextActions(loop)[0].action).toMatch(/Write a failing test/);
    loop = loop.map((e) => applyEvent(applyEvent(applyEvent(e, "write-red"), "go-green"), "finish"));
    expect(loopComplete(loop)).toBe(true);
    expect(nextActions(loop)).toHaveLength(0);
  });
});
