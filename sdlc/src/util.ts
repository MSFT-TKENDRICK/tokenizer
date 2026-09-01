import { promises as fs } from "node:fs";
import * as path from "node:path";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readText(file: string): Promise<string> {
  return fs.readFile(file, "utf8");
}

export async function writeText(file: string, contents: string): Promise<void> {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, contents, "utf8");
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function fileSize(p: string): Promise<number> {
  try {
    const st = await fs.stat(p);
    return st.isFile() ? st.size : 0;
  } catch {
    return 0;
  }
}

/** Pad a numeric counter to a 3-digit, zero-prefixed id segment. */
export function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

/** Emit a YAML frontmatter block from a flat-ish record. */
export function emitFrontmatter(data: Record<string, unknown>): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else if (value.every((v) => typeof v === "string" && !v.includes("\n"))) {
        lines.push(`${key}: [${value.map((v) => yamlScalar(String(v))).join(", ")}]`);
      } else {
        lines.push(`${key}:`);
        for (const v of value) lines.push(`  - ${yamlScalar(String(v))}`);
      }
    } else {
      lines.push(`${key}: ${yamlScalar(String(value))}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

/** Quote a YAML scalar only when required. */
export function yamlScalar(value: string): string {
  if (value === "") return '""';
  if (/^[A-Za-z0-9 _./-]+$/.test(value) && !/^\d/.test(value)) return value;
  if (/^(true|false|null|yes|no)$/i.test(value)) return `"${value}"`;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Sort requirement ids like FR-001 numerically within their prefix. */
export function compareRequirementIds(a: string, b: string): number {
  const pa = a.split("-");
  const pb = b.split("-");
  if (pa[0] !== pb[0]) return pa[0].localeCompare(pb[0]);
  return Number(pa[1] ?? 0) - Number(pb[1] ?? 0);
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
