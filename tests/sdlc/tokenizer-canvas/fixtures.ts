// Shared fixtures for the SDLC TDD tests of feature 002 (Tokenizer Copilot
// Desktop Canvas). These tests target the dependency-free ESM modules the canvas
// iframe ships (`web/tokenizer.mjs`, `web/models.mjs`), proving they stay a 1:1
// port of the web app's TypeScript source — the only logic the spec lets the
// canvas reuse (FR-002, FR-005).

export const CORPUS: readonly string[] = [
  "",
  "hello world",
  "The quick brown fox jumps over 13 lazy dogs.",
  "const x = a === b ? 1 : 2; // operators && punctuation",
  "emoji test 👩‍💻🚀🇬🇧 mixed with words",
  "multi\nline\r\ntext\rwith newlines",
  "numbers 1,000.50 and 2024-06-12 plus +7 -3",
  "    leading and   internal   whitespace\t\ttabs",
  "Unicode: naïve café façade — em-dash, don't, it’s",
  "symbols $ € £ ¥ © ® ™ ± ÷ × and punctuation !?.,;:",
];

/** Build a string that tokenizes to approximately `targetTokens` tokens. */
export function buildLargeInput(targetTokens: number): string {
  // "ab " => 1 word token + 1 whitespace token = 2 tokens per repetition.
  const reps = Math.ceil(targetTokens / 2);
  return "ab ".repeat(reps);
}
