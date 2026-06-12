import type { Requirement, SpecDocument, SquadRole } from "../types.js";
import { unique } from "../util.js";

/** Static metadata for each role the forge can instantiate. */
interface RoleTemplate {
  id: string;
  name: string;
  description: string;
  tools: string[];
  skills: string[];
}

const READ_WRITE_TOOLS = ["view", "edit", "bash", "grep", "glob"];
const READ_ONLY_TOOLS = ["view", "grep", "glob"];

const ROLE_TEMPLATES: Record<string, RoleTemplate> = {
  frontend: {
    id: "frontend",
    name: "Frontend Engineer",
    description: "Implements UI, components, rendering, and interaction requirements.",
    tools: READ_WRITE_TOOLS,
    skills: [],
  },
  core: {
    id: "core",
    name: "Core Logic Engineer",
    description: "Implements domain algorithms and pure business logic.",
    tools: READ_WRITE_TOOLS,
    skills: [],
  },
  data: {
    id: "data",
    name: "Data & Persistence Engineer",
    description: "Implements storage, caching, serialization, and data-flow requirements.",
    tools: READ_WRITE_TOOLS,
    skills: [],
  },
  performance: {
    id: "performance",
    name: "Performance Engineer",
    description: "Owns latency/throughput budgets and performance verification.",
    tools: READ_WRITE_TOOLS,
    skills: [],
  },
  accessibility: {
    id: "accessibility",
    name: "Accessibility Engineer",
    description: "Owns WCAG/ARIA/keyboard requirements and a11y automation.",
    tools: READ_WRITE_TOOLS,
    skills: [],
  },
  security: {
    id: "security",
    name: "Security Engineer",
    description: "Owns input sanitization, auth, and security verification.",
    tools: READ_WRITE_TOOLS,
    skills: [],
  },
  quality: {
    id: "quality",
    name: "Quality Engineer",
    description: "Owns non-functional requirements not claimed by a specialist.",
    tools: READ_WRITE_TOOLS,
    skills: [],
  },
  architecture: {
    id: "architecture",
    name: "Architecture Steward",
    description: "Owns constraints and records ADRs for spec revisions.",
    tools: READ_ONLY_TOOLS,
    skills: [],
  },
  "test-automation": {
    id: "test-automation",
    name: "Test Automation Engineer",
    description:
      "Writes BDD features and red/green tests, and proves every functional requirement with evidence (coverage, screenshots, video, Playwright).",
    tools: READ_WRITE_TOOLS,
    skills: [],
  },
};

const KEYWORDS = {
  frontend: [
    "ui",
    "display",
    "render",
    "view",
    "page",
    "screen",
    "button",
    "input field",
    "highlight",
    "copy",
    "layout",
    "theme",
    "component",
    "color",
    "panel",
    "tooltip",
    "responsive",
  ],
  data: ["persist", "store", "storage", "cache", "database", "serialize", "load", "save", "export", "import"],
  core: [
    "tokeni",
    "encode",
    "decode",
    "count",
    "compute",
    "parse",
    "algorithm",
    "model",
    "segment",
    "calculate",
    "validate",
  ],
};

function matchesAny(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w));
}

/** Determine the implementer role for a functional requirement. */
function functionalRole(req: Requirement): string {
  const cap = (req.capability ?? "").toLowerCase();
  if (cap.includes("ui") || cap.includes("visual") || cap.includes("render")) return "frontend";
  if (cap.includes("storage") || cap.includes("data") || cap.includes("persist")) return "data";
  if (matchesAny(req.text, KEYWORDS.frontend)) return "frontend";
  if (matchesAny(req.text, KEYWORDS.data)) return "data";
  return "core";
}

/** Determine the specialist role for a non-functional requirement. */
function nonFunctionalRole(req: Requirement): string {
  if (matchesAny(req.text, ["accessib", "a11y", "wcag", "aria", "keyboard", "screen reader"])) {
    return "accessibility";
  }
  if (matchesAny(req.text, ["security", "auth", "sanitiz", "xss", "csrf", "secret", "permission"])) {
    return "security";
  }
  if (matchesAny(req.text, ["performance", "latency", "throughput", "speed", "ms", "fps", "memory"])) {
    return "performance";
  }
  return "quality";
}

/**
 * Derive the set of roles the squad needs so that *every* requirement is owned.
 * Each functional requirement is additionally owned by the Test Automation
 * Engineer, who is accountable for proving it with evidence.
 */
export function deriveRoles(spec: SpecDocument): SquadRole[] {
  const owners = new Map<string, Set<string>>(); // roleId -> requirementIds

  const assign = (roleId: string, reqId: string) => {
    if (!owners.has(roleId)) owners.set(roleId, new Set());
    owners.get(roleId)!.add(reqId);
  };

  for (const req of spec.requirements) {
    if (req.kind === "functional") {
      assign(functionalRole(req), req.id);
      assign("test-automation", req.id);
    } else if (req.kind === "non-functional") {
      assign(nonFunctionalRole(req), req.id);
    } else {
      assign("architecture", req.id);
    }
  }

  const capByReq = new Map(spec.requirements.map((r) => [r.id, r.capability]));

  const roles: SquadRole[] = [];
  for (const [roleId, reqSet] of owners) {
    const template = ROLE_TEMPLATES[roleId];
    const requirementIds = [...reqSet].sort();
    const capabilities = unique(
      requirementIds.map((id) => capByReq.get(id)).filter((c): c is string => Boolean(c)),
    ).sort();
    roles.push({
      id: roleId,
      name: template.name,
      description: template.description,
      capabilities,
      tools: template.tools,
      requirementIds,
      skills: template.skills,
    });
  }

  // Stable, readable order: implementers, specialists, architecture, QA last.
  const order = [
    "frontend",
    "core",
    "data",
    "performance",
    "accessibility",
    "security",
    "quality",
    "architecture",
    "test-automation",
  ];
  roles.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return roles;
}

export const roleCatalog = ROLE_TEMPLATES;
