# Interview agenda — spec 001 "Model Cost Comparison Panel"

The SDLC agent must resolve these ambiguities with the user before generating the
squad. Each resolved item becomes a micro-spec facet (and, where it changes the
spec, an ADR).

**Load:** 5 questions — blocking 1, high 3, medium 1, low 0.

| Id | Severity | Kind | Target | Question |
| --- | --- | --- | --- | --- |
| AMB-001 | blocking | explicit-marker | FR-009 | show all models, only GA models, or only the user's recent models? |
| AMB-002 | high | missing-acceptance-criteria | FR-006 | What are the explicit acceptance criteria for FR-006 ("The comparison table MUST be sortable by input cost and by …")? Describe the observable pass/fail outcome. |
| AMB-003 | high | missing-acceptance-criteria | FR-008 | What are the explicit acceptance criteria for FR-008 ("The panel MUST update responsively as the user edits the in…")? Describe the observable pass/fail outcome. |
| AMB-004 | high | missing-acceptance-criteria | FR-009 | What are the explicit acceptance criteria for FR-009 ("The system MUST handle the model set shown by default [NEED…")? Describe the observable pass/fail outcome. |
| AMB-005 | medium | missing-non-functional | security | The spec has no security requirement. What security targets must the implementation meet (or is security explicitly out of scope)? |
