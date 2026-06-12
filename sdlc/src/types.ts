/**
 * Shared domain model for the agentic SDLC squad forge.
 *
 * The pipeline maps SpecKit specs -> ambiguities -> micro-spec facets / ADRs ->
 * roles -> squads (sdk-style custom agents) -> ASSERT evals -> BDD features ->
 * TDD loops -> evidence, with every artifact traceable back to a requirement id.
 */

export type RequirementKind = "functional" | "non-functional" | "constraint";

/** A single, addressable requirement extracted from a SpecKit spec. */
export interface Requirement {
  /** Stable id, e.g. `FR-001`, `NFR-002`, `CON-001`. */
  id: string;
  kind: RequirementKind;
  text: string;
  /** Optional capability tag the requirement belongs to (`[cap:tokenization]`). */
  capability?: string;
  /** Priority marker if present (`MUST` / `SHOULD` / `MAY`). */
  priority?: "MUST" | "SHOULD" | "MAY";
  sourceFile: string;
  line: number;
}

/** A user story (`As a ... I want ... so that ...`). */
export interface UserStory {
  id: string;
  role: string;
  want: string;
  soThat: string;
  sourceFile: string;
  line: number;
}

/** A parsed SpecKit feature spec (the `specs/NNN-slug/` directory). */
export interface SpecDocument {
  /** Feature id derived from directory, e.g. `001`. */
  id: string;
  slug: string;
  title: string;
  dir: string;
  capabilities: string[];
  requirements: Requirement[];
  userStories: UserStory[];
  /** `[NEEDS CLARIFICATION: ...]` markers and bare open questions. */
  openQuestions: OpenQuestion[];
}

export interface OpenQuestion {
  id: string;
  text: string;
  requirementId?: string;
  sourceFile: string;
  line: number;
}

export type AmbiguitySeverity = "blocking" | "high" | "medium" | "low";

export type AmbiguityKind =
  | "explicit-marker"
  | "missing-acceptance-criteria"
  | "vague-quantifier"
  | "undefined-term"
  | "missing-non-functional"
  | "conflicting-requirements"
  | "missing-capability-owner";

/** A detected gap that the SDLC agent should interview the user about. */
export interface Ambiguity {
  id: string;
  kind: AmbiguityKind;
  severity: AmbiguitySeverity;
  requirementId?: string;
  capability?: string;
  /** The question to put to the user during the interview. */
  question: string;
  rationale: string;
  sourceFile: string;
  line: number;
}

export type FacetStatus = "proposed" | "accepted" | "superseded";

/**
 * A micro-spec facet: a focused enrichment of the SpecKit spec generated for an
 * identified ambiguity. Facets carry the knowledge an agent needs to execute a
 * task but that is missing from the current spec/repo context.
 */
export interface MicroSpecFacet {
  id: string;
  title: string;
  status: FacetStatus;
  /** Requirements this facet enriches/clarifies. */
  requirementIds: string[];
  capability?: string;
  /** The ambiguity that triggered this facet. */
  ambiguityId?: string;
  question: string;
  /** Resolved knowledge captured from the interview. */
  resolution: string;
  /** Concrete, testable acceptance criteria added by the facet. */
  acceptanceCriteria: string[];
  /** Optional reference to a governing ADR. */
  adrId?: string;
  createdAt: string;
  supersededBy?: string;
}

export type AdrStatus = "proposed" | "accepted" | "superseded" | "deprecated";

/** Architecture Decision Record recording a revision to the SpecKit specs. */
export interface Adr {
  id: string;
  title: string;
  status: AdrStatus;
  context: string;
  decision: string;
  consequences: string[];
  /** Requirements / facets affected by the decision. */
  requirementIds: string[];
  facetIds: string[];
  supersedes?: string;
  date: string;
}

/** A role the squad needs to cover, derived from spec capabilities. */
export interface SquadRole {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  /** Default Copilot tool names this role is scoped to. */
  tools: string[];
  /** Requirements this role is responsible for. */
  requirementIds: string[];
  /** Skills (Agent Skills) to preload for this role. */
  skills: string[];
}

/**
 * A squad member: an sdk-style custom agent definition. Mirrors the Copilot SDK
 * `CustomAgentConfig` ({ name, displayName, description, tools, prompt, skills,
 * infer }) and the `.github/agents/<name>.agent.md` file format.
 */
export interface SquadMember {
  name: string;
  displayName: string;
  description: string;
  tools: string[] | null;
  prompt: string;
  skills: string[];
  infer: boolean;
  model?: string;
  /** Provenance: requirements this member is provably grounded in. */
  requirementIds: string[];
  roleId: string;
}

/** The generated squad and the proof that it is grounded in the spec. */
export interface SquadManifest {
  specId: string;
  specSlug: string;
  generatedAt: string;
  /** Inference engine that derived the squad (`copilot-sdk` or `deterministic`). */
  engine: string;
  model?: string;
  members: SquadMember[];
  grounding: GroundingReport;
}

/** Proof that every requirement is owned and every member traces to a requirement. */
export interface GroundingReport {
  ok: boolean;
  specId: string;
  totalRequirements: number;
  coveredRequirements: number;
  coverageRatio: number;
  /** Requirements with no owning squad member. */
  uncoveredRequirements: string[];
  /** Members that reference no real requirement. */
  ungroundedMembers: string[];
  /** Members that reference a requirement id that does not exist. */
  danglingReferences: { member: string; requirementId: string }[];
  /** requirementId -> member names that own it. */
  coverageByRequirement: Record<string, string[]>;
}

/** ASSERT model reference. */
export interface AssertModel {
  name: string;
  temperature?: number;
  max_tokens?: number;
}

export interface AssertJudgeDimension {
  description: string;
  rubric: string;
}

/** A minimal, faithful subset of an ASSERT `eval_config.yaml`. */
export interface AssertEvalConfig {
  suite: string;
  run: string;
  behavior: {
    name: string;
    description: string;
  };
  context: string;
  default_model: AssertModel;
  pipeline: {
    systematize: {
      behavior_category_count: number;
      web_search: boolean;
      model: AssertModel;
    };
    test_set: {
      stratify: {
        model: AssertModel;
        dimensions: { name: string; description: string }[];
      };
      prompt: { sample_size: number; model: AssertModel };
      scenario: { sample_size: number; model: AssertModel };
    };
    inference: {
      concurrency: number;
      target: { callable: string; trace?: { backend: string; group_by: string } };
      tester: { model: AssertModel };
      max_turns: number;
    };
    judge: {
      preset?: string;
      dimensions: Record<string, AssertJudgeDimension>;
      model: AssertModel;
    };
  };
  /** Provenance (emitted as a YAML comment block, not part of ASSERT schema). */
  groundedIn: string[];
}

/** A Gherkin scenario. */
export interface BddScenario {
  name: string;
  tags: string[];
  given: string[];
  when: string[];
  then: string[];
  requirementId: string;
}

/** A Gherkin feature generated from a SpecKit requirement/capability. */
export interface BddFeature {
  capability: string;
  title: string;
  narrative: { role: string; want: string; soThat: string };
  scenarios: BddScenario[];
  requirementIds: string[];
}

export type TddPhase = "red" | "green" | "refactor" | "done";

/** A single requirement's position in the TDD red/green loop. */
export interface TddLoopEntry {
  requirementId: string;
  phase: TddPhase;
  testFile: string;
  featureFile?: string;
  /** Has a failing test been written (red)? */
  redAt?: string;
  /** Has the implementation made it pass (green)? */
  greenAt?: string;
  notes: string[];
}

export type EvidenceKind =
  | "coverage"
  | "screenshot"
  | "video"
  | "playwright-trace"
  | "playwright-spec"
  | "test-report"
  | "bdd-feature";

export interface EvidenceArtifact {
  kind: EvidenceKind;
  path: string;
  exists: boolean;
  bytes: number;
  description: string;
}

/** Required + collected evidence for one feature/requirement. */
export interface EvidenceManifest {
  specId: string;
  capability: string;
  requirementIds: string[];
  generatedAt: string;
  required: EvidenceKind[];
  artifacts: EvidenceArtifact[];
  coverage?: { lines: number; statements: number; functions: number; branches: number };
  complete: boolean;
  missing: EvidenceKind[];
}
