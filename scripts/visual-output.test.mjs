import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { resolveVisualOutputDirectory } from "./visual-output.mjs";

describe("resolveVisualOutputDirectory", () => {
  it("allows nested output paths inside the project", () => {
    const root = resolve("project-root");

    expect(resolveVisualOutputDirectory(root, "visual-results/run-1")).toBe(
      resolve(root, "visual-results/run-1"),
    );
  });

  it.each(["..", "../outside", "visual-results/../../outside"])("rejects output path %s outside the project", (path) => {
    expect(() => resolveVisualOutputDirectory(resolve("project-root"), path)).toThrow(
      "VISUAL_OUTPUT_DIR must resolve to a directory inside the project.",
    );
  });
});
