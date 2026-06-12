export * from "./types.js";
export * as util from "./util.js";

export { loadSpec, parseSpecMarkdown, parseSpecDirName } from "./speckit/parser.js";
export {
  detectAmbiguities,
  prioritizeAmbiguities,
  ambiguityStats,
} from "./speckit/ambiguity.js";

export { createFacet, facetFromAmbiguity, renderFacet, writeFacet, resolveFacet } from "./facets/facet.js";
export { createAdr, adrFromFacets, renderAdr, writeAdr } from "./facets/adr.js";

export { deriveRoles, roleCatalog } from "./squad/roles.js";
export { verifyGrounding, renderGroundingReport, assertGrounded } from "./squad/grounding.js";
export {
  forgeSquad,
  renderSquadMemberAgent,
  writeSquadMember,
  writeSquadManifest,
  writeSquad,
} from "./squad/forge.js";

export {
  type InferenceProvider,
  DeterministicInferenceProvider,
  CopilotSdkInferenceProvider,
  createInferenceProvider,
  buildBaselinePrompt,
} from "./sdk/inference.js";
export { buildFleetPrompt, toCustomAgentConfig, dispatchFleet } from "./sdk/fleet.js";

export {
  buildSquadEval,
  buildFeatureEval,
  renderEvalConfig,
  writeEvalConfig,
  evalConfigFileName,
} from "./assert/evalConfig.js";

export { generateFeatures, renderFeature, writeFeatures } from "./bdd/featureGen.js";

export {
  initLoop,
  applyEvent,
  loopComplete,
  nextActions,
  renderLoopReport,
  writeLoopState,
  readLoopState,
  testFileFor,
} from "./tdd/loop.js";

export {
  requiredEvidence,
  isVisualCapability,
  collectEvidence,
  discoverEvidence,
  renderEvidenceReport,
  writeEvidenceManifest,
  assertEvidenceComplete,
} from "./evidence/collector.js";

export { runPipeline, type PipelineOptions, type PipelineResult } from "./pipeline.js";
