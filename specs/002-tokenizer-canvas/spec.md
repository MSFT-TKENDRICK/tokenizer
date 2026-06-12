# Feature: Tokenizer Copilot Desktop Canvas

> SpecKit feature spec. Author with `/speckit.specify`; clarify with
> `/speckit.clarify`; plan with `/speckit.plan`; break down with `/speckit.tasks`.

## Overview

Surface the tokenizer inside the **GitHub Copilot desktop app** as a **canvas
extension** that opens in the app's side panel. The canvas lets a user paste or
type text and immediately see how it tokenizes — token-by-token visualization,
summary metrics, and a side-by-side input-cost comparison across the Copilot
models the app already knows about (`src/lib/copilotModels.ts`) — without leaving
their Copilot session. The canvas reuses the project's existing `tokenize`
algorithm and model catalog so the desktop surface stays consistent with the web
app, and it is wired through the Copilot SDK canvas contract
(`joinSession({ canvases: [createCanvas({...})] })`) served from a loopback iframe.

## User Stories

- As a Copilot desktop user, I want to open the tokenizer in the side panel, so that I can inspect tokenization of my prompt while I keep working in chat.
- As a prompt author, I want to see token, character, and byte counts update live as I edit, so that I can trim a prompt to fit a model's context window.
- As a budget owner, I want each model's input cost in USD and AI credits, so that I can pick the cheapest model that still fits my prompt before pasting it elsewhere.
- As the Copilot agent, I want to push text into the canvas and read back its summary via canvas actions, so that I can drive the tool on the user's behalf.

## Capabilities

- [cap:canvas-integration]
- [cap:tokenization]
- [cap:cost-estimation]
- [cap:comparison]
- [cap:visualization]
- [cap:persistence]
- [cap:interaction]

## Functional Requirements

- **FR-001**: The system MUST register a GitHub Copilot desktop canvas extension at `.github/extensions/tokenizer/extension.mjs` that declares a canvas (via `createCanvas`/`joinSession`) discoverable in the app's side panel and serves its UI from a per-instance loopback HTTP server. [cap:canvas-integration]
- **FR-002**: The canvas MUST tokenize the current input text using the project's existing `tokenize` algorithm, ported faithfully to the extension runtime so token boundaries match `src/lib/tokenizer.ts`. [cap:tokenization]
- **FR-003**: The canvas MUST display summary metrics for the current input: characters, bytes, words, lines, and token count. [cap:visualization]
- **FR-004**: The canvas MUST render each token as a discrete, labeled segment and MUST distinguish token categories using both color and a non-color affordance (visible category label or pattern). [cap:visualization]
- **FR-005**: The system MUST compute the estimated input cost in USD and in AI credits (using the documented 1 credit = $0.01 conversion) for every model in `COPILOT_MODEL_OPTIONS`. [cap:cost-estimation]
- **FR-006**: The canvas MUST present a comparison table with one row per model showing name, provider, input cost (USD and credits), and context-window usage, and the table MUST be sortable by input cost and by context usage. [cap:comparison]
- **FR-007**: The canvas MUST visually highlight any model whose context window cannot fit the current token count, with a non-color affordance in addition to color. [cap:visualization]
- **FR-008**: The canvas MUST expose agent/host-callable canvas actions — at minimum `set_text` (load text into the canvas) and `get_summary` (return the current metrics) — through the canvas SDK action contract. [cap:canvas-integration]
- **FR-009**: The system MUST persist the user's latest input text **scoped to the Copilot session** (keyed by `sessionId`) and restore it when the canvas is reopened within that same session. Persistence MUST write to the extension's own session-scoped artifacts directory under `$COPILOT_HOME` (deliberately outside the repository working tree); reopening the canvas in a different session MUST NOT surface another session's text. See ADR-002 / MSF-006. [cap:persistence]
- **FR-010**: The canvas MUST recompute and update all derived views (tokens, summary metrics, comparison table) responsively as the user edits the input. [cap:interaction]

## Non-Functional Requirements

- **NFR-001**: The canvas MUST meet WCAG 2.1 AA — the comparison table MUST use semantic table markup with a header row, every highlight/over-limit state MUST carry a non-color affordance, and all text MUST have a contrast ratio of at least 4.5:1. The canvas MUST style with the host-provided canvas theme tokens (e.g. `--background-color-default`, `--text-color-default`, `--font-sans`, `--font-mono`) so it matches the app's light/dark themes. [cap:visualization]
- **NFR-002**: Recomputing the full set of derived views after an input change MUST complete in under 50 ms for inputs up to 10,000 tokens. [cap:interaction]
- **NFR-003**: The extension MUST NOT write to `stdout` (reserved for JSON-RPC); all user-visible logging MUST go through `session.log`, and the embedded HTTP server MUST bind to loopback (`127.0.0.1`) only. [cap:canvas-integration]
