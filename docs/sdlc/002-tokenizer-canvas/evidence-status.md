# Evidence status — spec 002 "Tokenizer Copilot Desktop Canvas"

> Authored by the SDLC orchestrator. This complements the machine-generated
> `evidence.md` / `evidence/*.json` manifests. **All 13 requirements are now
> satisfied** — by SDLC-owned unit/coverage/Playwright/axe artifacts and/or by the
> canvas-runtime validation performed by the top-level orchestrator (who holds the
> `open_canvas` / `invoke_canvas_action` / `extensions_reload` tools this run lacks).
> Runtime facts cited below were supplied by that orchestrator as ground truth.

## Test + coverage run (this run)

- `npm test` (vitest 4.1.8) — **66/66 passing** (54 SDLC TDD tests in
  `tests/sdlc/tokenizer-canvas/` + 12 pre-existing `src/lib` tests).
- Playwright canvas visual suite (`canvas.visual.spec.ts` against the SDLC static
  server on `127.0.0.1:4178`) — **4/4 passing**; `@axe-core/playwright` (wcag2a +
  wcag2aa) found **zero serious/critical** violations.
- Coverage of the ported modules (v8): `web/tokenizer.mjs` **82.6% lines / 80% funcs**,
  `web/models.mjs` **70% lines** (uncovered = output-cost/family helpers outside the
  FRs under test). Report: `evidence/coverage/` (+ `coverage-summary.json`, HTML).
- Test report: `evidence/test-report.json`.
- Visual artifacts: `evidence/screenshots/FR-00{3,4,6,7}-*.png`,
  `evidence/playwright-results/*/{video.webm,trace.zip}`, `evidence/playwright-report/`.
- NFR-002 benchmark: full recompute of a 10,000-token input across all 23 models →
  **median ~5 ms** (budget < 50 ms).

## Per-requirement evidence

| Req | Capability | TDD phase | Evidence (satisfied) |
| --- | --- | --- | --- |
| FR-001 | canvas-integration | **green** | MSF-007 acceptance criteria + BDD; **runtime-validated** (extensions_reload → "tokenizer — ready", loopback `http.Server` on `127.0.0.1:<port>`, HTTP 200 for `/`) |
| FR-002 | tokenization | **green** | unit parity (13 tests), coverage, test-report, BDD |
| FR-003 | visualization | **green** | summary-metrics parity (unit), test-report, BDD; Playwright screenshot `FR-003-summary.png` + video + trace |
| FR-004 | visualization | **green** | BDD; Playwright `FR-004-tokens-labeled.png` (token-segment DOM + label toggle, non-color affordance) + video + trace |
| FR-005 | cost-estimation | **green** | cost math for all 23 models (5 tests), coverage, test-report, BDD |
| FR-006 | comparison | **green** | row-data + sort-key tests, test-report, BDD; Playwright `FR-006-table-sorted.png` (semantic `<table>`, click-to-sort, `aria-sort`) + video + trace |
| FR-007 | visualization | **green** | BDD; Playwright `FR-007-over-limit.png` (over-limit highlight + "▲ over" non-color flag) + video + trace |
| FR-008 | canvas-integration | **green** | BDD; **runtime-validated** `set_text`/`get_summary` action contract; get_summary numbers cross-validated by `FR-008.test.ts` |
| FR-009 | persistence | **green** | ADR-002 + MSF-006, BDD; **runtime-validated** (`set_text` → GET `/state` reflected); user text kept out of repo tree |
| FR-010 | interaction | **green** | derived-view consistency (unit), test-report, BDD; live DOM update via Playwright `FR-003-summary.png` |
| NFR-001 | visualization | **green** | NFR-001/MSF-009 criteria; `@axe-core/playwright` wcag2a+aa → 0 serious/critical; non-color affordances verified |
| NFR-002 | interaction | **green** | <50 ms recompute benchmark (median ~5 ms), test-report |
| NFR-003 | canvas-integration | **green** | MSF-010 security posture; **runtime-validated** (no stdout/JSON-RPC corruption; `127.0.0.1`-only bind) |

## Capability evidence manifests

| Capability | Manifest | Complete |
| --- | --- | --- |
| tokenization | `evidence/tokenization.json` | ✅ yes |
| cost-estimation | `evidence/cost-estimation.json` | ✅ yes |
| visualization | `evidence/visualization.json` | ✅ yes |
| comparison | `evidence/comparison.json` | ✅ yes |
| interaction | `evidence/interaction.json` | ✅ yes |
| canvas-integration | `evidence/canvas-integration.json` | ✅ yes |
| persistence | `evidence/persistence.json` | ✅ yes |

## Provenance of runtime-validated evidence

FR-001, FR-008, FR-009 and NFR-003 depend on the live canvas runtime (extension
registration, action contract, session persistence, stdout discipline). Those tools
(`extensions_reload`, `open_canvas`, `invoke_canvas_action`) are held by the
top-level orchestrator, who ran them and supplied the results cited above as ground
truth. The SDLC orchestrator independently reproduced the **visual** surface by
serving `.github/extensions/tokenizer/web/` on a fixed loopback port
(`static-server.mjs`) and driving it with Playwright + axe, yielding the
screenshots, videos and traces for FR-003/004/006/007 and NFR-001. No requirement
remains pending.
