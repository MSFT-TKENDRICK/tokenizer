import type { Ambiguity, AmbiguityKind, Requirement, SpecDocument } from "../types.js";

/** Words that signal an unmeasurable requirement the agent should clarify. */
const VAGUE_TERMS = [
  "fast",
  "quick",
  "quickly",
  "slow",
  "efficient",
  "efficiently",
  "intuitive",
  "user-friendly",
  "easy to use",
  "appropriate",
  "appropriately",
  "reasonable",
  "robust",
  "scalable",
  "secure",
  "performant",
  "responsive",
  "seamless",
  "modern",
  "etc",
  "and so on",
  "several",
  "some",
  "many",
  "as needed",
  "where possible",
];

/** Non-functional categories a production spec should address. */
const NFR_CATEGORIES: { name: string; keywords: string[] }[] = [
  { name: "performance", keywords: ["performance", "latency", "throughput", "speed", "ms", "fps"] },
  { name: "accessibility", keywords: ["accessib", "a11y", "wcag", "aria", "screen reader", "keyboard"] },
  { name: "security", keywords: ["security", "auth", "permission", "sanitiz", "xss", "csrf", "secret"] },
];

const SEVERITY_BY_KIND: Record<AmbiguityKind, Ambiguity["severity"]> = {
  "explicit-marker": "blocking",
  "conflicting-requirements": "blocking",
  "missing-acceptance-criteria": "high",
  "vague-quantifier": "high",
  "missing-non-functional": "medium",
  "missing-capability-owner": "medium",
  "undefined-term": "low",
};

function hasMeasurableOutcome(text: string): boolean {
  if (/\d/.test(text)) return true;
  // explicit verbs that imply an observable outcome
  return /\b(display|render|return|reject|validate|persist|emit|navigate|highlight|copy|export|toggle|count|compute|encode|decode|tokeni[sz]e)\b/i.test(
    text,
  );
}

function findVagueTerm(text: string): string | undefined {
  const lower = text.toLowerCase();
  return VAGUE_TERMS.find((term) => new RegExp(`\\b${term.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`).test(lower));
}

function mk(
  kind: AmbiguityKind,
  partial: Omit<Ambiguity, "id" | "kind" | "severity">,
  seq: number,
): Ambiguity {
  return {
    id: `AMB-${String(seq).padStart(3, "0")}`,
    kind,
    severity: SEVERITY_BY_KIND[kind],
    ...partial,
  };
}

/**
 * Detect ambiguities and missing knowledge in a spec. Each result is phrased as
 * an interview question for the SDLC agent to put to the user, and feeds the
 * generation of micro-spec facets.
 */
export function detectAmbiguities(spec: SpecDocument): Ambiguity[] {
  const out: Ambiguity[] = [];
  let seq = 0;

  // 1. Explicit [NEEDS CLARIFICATION] markers and open questions.
  for (const q of spec.openQuestions) {
    out.push(
      mk(
        "explicit-marker",
        {
          requirementId: q.requirementId,
          question: q.text.endsWith("?") ? q.text : `${q.text}?`,
          rationale: "Spec explicitly flags this as needing clarification.",
          sourceFile: q.sourceFile,
          line: q.line,
        },
        (seq += 1),
      ),
    );
  }

  // 2. Per-requirement checks.
  for (const req of spec.requirements) {
    const vague = findVagueTerm(req.text);
    if (vague) {
      out.push(
        mk(
          "vague-quantifier",
          {
            requirementId: req.id,
            capability: req.capability,
            question: `${req.id} uses the unmeasurable term "${vague}". What is the concrete, testable threshold or definition?`,
            rationale: `Cannot write an ASSERT rubric or a passing test for "${vague}" without a measurable target.`,
            sourceFile: req.sourceFile,
            line: req.line,
          },
          (seq += 1),
        ),
      );
    }

    if (req.kind === "functional" && !hasMeasurableOutcome(req.text)) {
      out.push(
        mk(
          "missing-acceptance-criteria",
          {
            requirementId: req.id,
            capability: req.capability,
            question: `What are the explicit acceptance criteria for ${req.id} ("${truncate(req.text)}")? Describe the observable pass/fail outcome.`,
            rationale: "No observable outcome detected; needed for BDD scenarios and TDD assertions.",
            sourceFile: req.sourceFile,
            line: req.line,
          },
          (seq += 1),
        ),
      );
    }
  }

  // 3. Missing NFR coverage.
  const allText = spec.requirements.map((r) => r.text.toLowerCase()).join(" \n ");
  const hasFunctional = spec.requirements.some((r) => r.kind === "functional");
  if (hasFunctional) {
    for (const cat of NFR_CATEGORIES) {
      const covered = cat.keywords.some((k) => allText.includes(k));
      if (!covered) {
        out.push(
          mk(
            "missing-non-functional",
            {
              capability: cat.name,
              question: `The spec has no ${cat.name} requirement. What ${cat.name} targets must the implementation meet (or is ${cat.name} explicitly out of scope)?`,
              rationale: `A squad cannot be held accountable for ${cat.name} without a stated, gradeable target.`,
              sourceFile: firstSourceFile(spec),
              line: 0,
            },
            (seq += 1),
          ),
        );
      }
    }
  }

  // 4. Capabilities with no owning requirement.
  for (const cap of spec.capabilities) {
    const owned = spec.requirements.some((r) => r.capability === cap);
    if (!owned) {
      out.push(
        mk(
          "missing-capability-owner",
          {
            capability: cap,
            question: `Capability "${cap}" is named but has no requirement that tags it. Which requirements define this capability?`,
            rationale: "Ungrounded capabilities cannot be assigned to a squad member.",
            sourceFile: firstSourceFile(spec),
            line: 0,
          },
          (seq += 1),
        ),
      );
    }
  }

  return out;
}

function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function firstSourceFile(spec: SpecDocument): string {
  return spec.requirements[0]?.sourceFile ?? `${spec.slug}/spec.md`;
}

/** Order ambiguities by severity then source for a stable interview agenda. */
export function prioritizeAmbiguities(ambiguities: Ambiguity[]): Ambiguity[] {
  const rank: Record<Ambiguity["severity"], number> = { blocking: 0, high: 1, medium: 2, low: 3 };
  return [...ambiguities].sort((a, b) => rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id));
}

/** Quick helper used by tests/CLI to summarise interview load. */
export function ambiguityStats(ambiguities: Ambiguity[]): Record<Ambiguity["severity"], number> {
  const stats: Record<Ambiguity["severity"], number> = { blocking: 0, high: 0, medium: 0, low: 0 };
  for (const a of ambiguities) stats[a.severity] += 1;
  return stats;
}

export type { Requirement };
