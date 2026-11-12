import { isAbsolute, relative, resolve, sep } from "node:path";

export function resolveVisualOutputDirectory(projectRoot, requestedPath) {
  const root = resolve(projectRoot);
  const outputDirectory = resolve(root, requestedPath);
  const relativePath = relative(root, outputDirectory);

  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error("VISUAL_OUTPUT_DIR must resolve to a directory inside the project.");
  }

  return outputDirectory;
}
