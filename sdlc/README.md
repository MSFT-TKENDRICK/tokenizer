# `@tokenizer/sdlc` — agentic SDLC squad forge

A self-contained TypeScript toolkit that turns a [SpecKit](https://github.com/github/spec-kit)
feature spec into a **provably spec-grounded squad** of Copilot custom agents, with
ASSERT-style evals, BDD features, a TDD loop, and an evidence manifest — one command.

It is the engine behind the `sdlc` Copilot custom agent
(`.github/agents/sdlc.agent.md`). See `docs/sdlc/sdlc-agentic-workflow.md` for the
end-to-end methodology.

## Why

Four ideas, wired together:

- **SpecKit** specs are the only source of truth.
- **Copilot SDK** "sdk-style squads": squad members are custom agents, dispatched as
  a parallel **fleet**.
- **ASSERT**: natural-language specs → executable evals that generate *and* police
  the squad.
- **Copilot SDK inference** crafts each member's grounded prompt — with a
  deterministic, offline fallback so the toolkit builds and tests with no network and
  no API key.

## Install & build

```bash
cd sdlc
npm install
npm run build      # tsc → dist/
npm test           # vitest (offline, deterministic)
npm run typecheck
```

The Copilot SDK (`@github/copilot-sdk`) is an **optional** dependency: everything
builds and all tests pass without it. It is only loaded at runtime when you pass
`--engine copilot-sdk` or actually start a fleet.

## CLI

```bash
node bin/sdlc.mjs <command> <specDir> [options]
```

| Command | What it does |
| --- | --- |
| `run <specDir>` | Full pipeline: interview → facets → grounded squad → ASSERT evals → BDD → TDD loop → evidence. |
| `interview <specDir>` | Print the prioritized ambiguity-driven interview agenda. |
| `ground <specDir>` | Forge the squad and print the grounding proof only. |
| `fleet <manifest>` | Build (or `--start`) the fleet-mode dispatch for a squad manifest. |

Options: `--repo <dir>` (artifact root, default cwd), `--engine deterministic|copilot-sdk`,
`--model <name>`, `--no-agents`, `--no-strict`.

## Programmatic API

```ts
import { runPipeline, forgeSquad, verifyGrounding, loadSpec } from "@tokenizer/sdlc";

const spec = await loadSpec("specs/001-model-cost-comparison");
const result = await runPipeline({ repoRoot: ".", specDir: spec.dir });
console.log(result.manifest.grounding.ok); // true ⇒ provably grounded
```

## Module map

| Module | Responsibility |
| --- | --- |
| `speckit/parser.ts` | Parse `spec.md`/`plan.md`/`tasks.md` into structured requirements, capabilities, stories, open questions. |
| `speckit/ambiguity.ts` | Detect ambiguities (explicit markers, vague terms, missing acceptance criteria / NFRs / capability owners). |
| `facets/facet.ts`, `facets/adr.ts` | Create/render micro-spec facets and ADRs. |
| `squad/roles.ts` | Derive roles that cover every requirement (implementer / specialist / architect / QA). |
| `squad/grounding.ts` | **Prove** coverage = 100%, no ungrounded members, no dangling refs. |
| `squad/forge.ts` | Assemble members + write them as `.agent.md` custom agents. |
| `sdk/inference.ts` | `InferenceProvider`: deterministic + Copilot-SDK-backed prompt crafting. |
| `sdk/fleet.ts` | Build fleet dispatch prompt / `CustomAgentConfig`s; `dispatchFleet`. |
| `assert/evalConfig.ts` | Emit ASSERT `eval_config.yaml` (squad-grounding + per-capability). |
| `bdd/featureGen.ts` | Generate Gherkin features (one per capability, one scenario per requirement). |
| `tdd/loop.ts` | Guarded red → green → refactor → done loop state. |
| `evidence/collector.ts` | Compute required evidence and verify completeness. |
| `pipeline.ts` | Orchestrate all of the above. |

## Testing

`vitest` with v8 coverage; the suite runs fully offline using fake Copilot SDK
clients for the SDK paths. Coverage stays well above 90% statements/functions.
