import * as path from "node:path";
import type {
  OpenQuestion,
  Requirement,
  RequirementKind,
  SpecDocument,
  UserStory,
} from "../types.js";
import { pathExists, readText, unique } from "../util.js";

const REQ_RE = /\b(FR|NFR|CON)-(\d{1,4})\b/;
const CAP_RE = /\[cap:([a-z0-9][a-z0-9-]*)\]/i;
const PRIORITY_RE = /\b(MUST(?: NOT)?|SHOULD(?: NOT)?|MAY)\b/;
const NEEDS_CLAR_RE = /\[NEEDS CLARIFICATION:\s*([^\]]+)\]/gi;
const STORY_RE = /As an?\s+(.+?),?\s+I want\s+(.+?),?\s+so that\s+(.+?)\.?$/i;

function kindFromPrefix(prefix: string): RequirementKind {
  if (prefix === "NFR") return "non-functional";
  if (prefix === "CON") return "constraint";
  return "functional";
}

/** Strip markdown list/bold decoration and the requirement id from a line. */
function cleanRequirementText(line: string, id: string): string {
  let text = line.replace(/^[\s>*-]+/, "").trim();
  // remove a leading bold id like **FR-001**: or `FR-001`:
  text = text.replace(new RegExp(`[*\`]*${id}[*\`]*\\s*[:.\\-)]*\\s*`), "");
  text = text.replace(CAP_RE, "").trim();
  return text.replace(/\s{2,}/g, " ").trim();
}

export interface ParsedSpec {
  title: string;
  capabilities: string[];
  requirements: Requirement[];
  userStories: UserStory[];
  openQuestions: OpenQuestion[];
}

/** Parse a single SpecKit markdown document into structured fragments. */
export function parseSpecMarkdown(text: string, sourceFile: string): ParsedSpec {
  const lines = text.split(/\r?\n/);
  const requirements: Requirement[] = [];
  const userStories: UserStory[] = [];
  const openQuestions: OpenQuestion[] = [];
  const capabilities = new Set<string>();
  let title = "";
  let storyCounter = 0;
  let questionCounter = 0;
  let inCapabilitySection = false;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trimEnd();
    const lineNo = index + 1;

    if (!title) {
      const h1 = line.match(/^#\s+(.*)$/);
      if (h1) {
        title = h1[1].replace(/^(feature|spec)(ification)?:\s*/i, "").trim();
        return;
      }
    }

    const heading = line.match(/^#{2,3}\s+(.*)$/);
    if (heading) {
      inCapabilitySection = /capabilit(y|ies)/i.test(heading[1]);
      return;
    }

    if (inCapabilitySection) {
      const bullet = line.match(/^\s*[-*]\s+(.+)$/);
      if (bullet) {
        const capMatch = bullet[1].match(CAP_RE);
        const cap = capMatch ? capMatch[1] : bullet[1].split(/[—:-]/)[0];
        capabilities.add(slugifyCapability(cap));
      }
    }

    const capInline = line.match(CAP_RE);
    if (capInline) capabilities.add(capInline[1].toLowerCase());

    const reqMatch = line.match(REQ_RE);
    if (reqMatch) {
      const id = `${reqMatch[1]}-${reqMatch[2].padStart(3, "0")}`;
      const priority = matchPriority(line);
      requirements.push({
        id,
        kind: kindFromPrefix(reqMatch[1]),
        text: cleanRequirementText(line, id),
        capability: capInline ? capInline[1].toLowerCase() : undefined,
        priority,
        sourceFile,
        line: lineNo,
      });
    }

    const story = line.match(STORY_RE);
    if (story) {
      storyCounter += 1;
      userStories.push({
        id: `US-${String(storyCounter).padStart(3, "0")}`,
        role: story[1].trim(),
        want: story[2].trim(),
        soThat: story[3].trim(),
        sourceFile,
        line: lineNo,
      });
    }

    NEEDS_CLAR_RE.lastIndex = 0;
    let nc: RegExpExecArray | null;
    while ((nc = NEEDS_CLAR_RE.exec(line)) !== null) {
      questionCounter += 1;
      openQuestions.push({
        id: `OQ-${String(questionCounter).padStart(3, "0")}`,
        text: nc[1].trim(),
        requirementId: reqMatch ? `${reqMatch[1]}-${reqMatch[2].padStart(3, "0")}` : undefined,
        sourceFile,
        line: lineNo,
      });
    }
  });

  return {
    title,
    capabilities: [...capabilities],
    requirements,
    userStories,
    openQuestions,
  };
}

function matchPriority(line: string): Requirement["priority"] {
  const m = line.match(PRIORITY_RE);
  if (!m) return undefined;
  const word = m[1].toUpperCase();
  if (word.startsWith("MUST")) return "MUST";
  if (word.startsWith("SHOULD")) return "SHOULD";
  return "MAY";
}

function slugifyCapability(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Derive `{ id, slug }` from a `specs/NNN-slug` directory name. */
export function parseSpecDirName(dirName: string): { id: string; slug: string } {
  const m = dirName.match(/^(\d{1,4})[-_](.+)$/);
  if (m) return { id: m[1].padStart(3, "0"), slug: m[2] };
  return { id: dirName, slug: dirName };
}

/**
 * Load a SpecKit feature spec from a directory containing spec.md (and
 * optionally plan.md / tasks.md). Fragments from all files are merged.
 */
export async function loadSpec(dir: string): Promise<SpecDocument> {
  const dirName = path.basename(dir);
  const { id, slug } = parseSpecDirName(dirName);
  const candidates = ["spec.md", "plan.md", "tasks.md"];

  let title = "";
  const requirements: Requirement[] = [];
  const userStories: UserStory[] = [];
  const openQuestions: OpenQuestion[] = [];
  const capabilities = new Set<string>();

  for (const file of candidates) {
    const full = path.join(dir, file);
    if (!(await pathExists(full))) continue;
    const parsed = parseSpecMarkdown(await readText(full), path.join(dirName, file));
    if (!title && parsed.title) title = parsed.title;
    requirements.push(...parsed.requirements);
    userStories.push(...parsed.userStories);
    openQuestions.push(...parsed.openQuestions);
    for (const cap of parsed.capabilities) capabilities.add(cap);
  }

  // Capabilities referenced by requirements should always be present.
  for (const req of requirements) if (req.capability) capabilities.add(req.capability);

  return {
    id,
    slug,
    title: title || slug,
    dir,
    capabilities: unique([...capabilities]).sort(),
    requirements: dedupeRequirements(requirements),
    userStories,
    openQuestions,
  };
}

function dedupeRequirements(reqs: Requirement[]): Requirement[] {
  const seen = new Map<string, Requirement>();
  for (const r of reqs) {
    if (!seen.has(r.id)) seen.set(r.id, r);
  }
  return [...seen.values()];
}
