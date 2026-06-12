# Feature: Model Cost Comparison Panel

> SpecKit feature spec. Author with `/speckit.specify`; clarify with
> `/speckit.clarify`; plan with `/speckit.plan`; break down with `/speckit.tasks`.

## Overview

Give the user a side-by-side comparison of how their current input text would
cost across the Copilot models the app already knows about (`src/lib/copilotModels.ts`),
so they can pick a model by price and context fit before pasting a prompt elsewhere.

## User Stories

- As a Copilot user, I want to compare the input cost of my text across models, so that I can choose the cheapest model that still fits my prompt.
- As a budget owner, I want costs shown in AI credits as well as USD, so that I can reason in the unit my plan bills in.

## Capabilities

- [cap:tokenization]
- [cap:cost-estimation]
- [cap:comparison]
- [cap:visualization]
- [cap:persistence]

## Functional Requirements

- **FR-001**: The system MUST tokenize the current input text using the existing `tokenize` function. [cap:tokenization]
- **FR-002**: The system MUST compute the estimated input cost in USD for every model in `COPILOT_MODEL_OPTIONS`. [cap:cost-estimation]
- **FR-003**: The system MUST also express each cost in AI credits using the documented 1 credit = $0.01 conversion. [cap:cost-estimation]
- **FR-004**: The UI MUST display a comparison table with one row per model, showing name, provider, input cost (USD and credits), and context-window usage. [cap:comparison]
- **FR-005**: The UI MUST visually highlight any model whose context window cannot fit the current token count. [cap:visualization]
- **FR-006**: The comparison table MUST be sortable by input cost and by context usage. [cap:comparison]
- **FR-007**: The system SHOULD persist the user's selected subset of models to local storage and restore it on reload. [cap:persistence]
- **FR-008**: The panel MUST update responsively as the user edits the input. [cap:comparison]
- **FR-009**: The system MUST handle the model set shown by default [NEEDS CLARIFICATION: show all models, only GA models, or only the user's recent models?]. [cap:comparison]

## Non-Functional Requirements

- **NFR-001**: The panel MUST meet WCAG 2.1 AA — the table MUST use semantic table markup with a header row, and all highlight states MUST have a non-color affordance and a contrast ratio of at least 4.5:1. [cap:visualization]
- **NFR-002**: Recomputing the full comparison after an input change MUST complete in under 50 ms for inputs up to 10,000 tokens. [cap:cost-estimation]
