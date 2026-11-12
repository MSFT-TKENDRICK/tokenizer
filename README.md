# Copilot Tokenizer

A local, interactive token and cost estimator for exploring how editor context can contribute to a coding-assistant request.

## What this demo does (and doesn't)

- Edit a sample conversation or paste a serialized request to see a deterministic, readable token approximation.
- Select illustrative context layers, inspect estimated input/output usage, and compare model catalog rates.
- Keep an invoice of submitted turns, including simulated cache-prefix accounting.
- The app does **not** connect to GitHub Copilot or call any language model. Assistant messages are canned examples, not generated responses.
- Token boundaries, cache behavior, routes, credits, and resulting costs are estimates. Provider tokenizers, routing, cache eligibility, and billing can differ.

## Model and pricing data

The catalog and its source links are maintained in `src/lib/copilotModels.ts`. The page identifies the catalog's verification date and links to official pricing and model documentation. Prices and availability can change; consult the linked provider documentation for current terms. Auto routing is not predictable by this estimator, so its selected route and discount are assumptions, not a quote.

## Development

Requires Node.js 22.12 or a newer supported LTS release.

```sh
npm ci
npm run dev
```

## Checks

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:a11y
```

The Playwright checks use the local app server configured in `playwright.config.ts`. Install the browser binaries once with `npx playwright install chromium` if they are missing.

Pull requests run the build and browser checks without deploying. Pushes to `main` also publish the Pages artifact.

## Dependency maintenance

Dependencies are pinned. The lockfile omits registry download URLs so clean installs work with either the public npm registry or a developer's registry mirror. Regenerate it with a current npm release that resolves peer dependencies; do not bypass peer checks with `--legacy-peer-deps`.

The last successful audit on 2026-11-12 reported eight development-only advisories through Workbox (`deepmerge`, `glob`, and `minimatch`) and the design linter (`zod`). Its proposed Workbox remediation was a breaking PWA plugin downgrade, and it reported no fix for the linter's Zod range. These remain unresolved upstream dependencies, not a clean audit. Recheck `npm audit` and `npm audit --omit=dev` when updating packages; registry errors must not be interpreted as passing audits.
