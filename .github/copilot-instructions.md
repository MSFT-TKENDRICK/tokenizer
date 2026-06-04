# Copilot instructions

- Read `DESIGN.md` before starting UI work and follow its tokens, components, and rationale.
- Preserve the `DESIGN.md` section order defined by the design.md spec.
- After editing `DESIGN.md`, run `npm run design:lint`.
- Use linter findings to refine design tokens and prose before continuing implementation.
- Do not ignore broken token references or contrast findings; fix them or document why they block the change.
- For UI/design-system changes, run `npm run design:fixtures` to regenerate the throw-away component test page from `DESIGN.md`.
- When checking visual parity with the extracted Command Line design, run `npm run design:visual-diff` and inspect `visual-diff/report.json` plus the generated screenshots.
- Treat the design loop as: read `DESIGN.md` → generate fixture → lint → inspect visual diff → refine tokens/prose/components.
