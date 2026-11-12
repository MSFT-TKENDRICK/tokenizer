import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseSpecMarkdown } from "../src/speckit/parser.js";
import type { SpecDocument } from "../src/types.js";

export const SAMPLE_SPEC = `# Feature: Token Visualizer

## User Stories
- As a developer, I want to see token boundaries, so that I understand model cost.

## Capabilities
- [cap:visualization]
- [cap:tokenization]
- [cap:storage]

## Functional Requirements
- **FR-001**: The system MUST tokenize input text into tokens. [cap:tokenization]
- **FR-002**: The UI MUST display each token with a distinct color. [cap:visualization]
- **FR-003**: The system MUST count the total number of tokens. [cap:tokenization]
- **FR-004**: The system SHOULD persist the last input to local storage. [cap:storage]
- **FR-005**: The interface MUST be intuitive. [cap:visualization]
- **FR-006**: The system MUST handle [NEEDS CLARIFICATION: which tokenizer model, BPE or WordPiece?]. [cap:tokenization]

## Non-Functional Requirements
- **NFR-001**: The app MUST meet WCAG 2.1 AA accessibility. [cap:visualization]
`;

/** Build an in-memory SpecDocument from the sample markdown. */
export function sampleSpec(): SpecDocument {
  const parsed = parseSpecMarkdown(SAMPLE_SPEC, "spec.md");
  return {
    id: "001",
    slug: "token-visualizer",
    title: parsed.title,
    dir: "specs/001-token-visualizer",
    capabilities: parsed.capabilities,
    requirements: parsed.requirements,
    userStories: parsed.userStories,
    openQuestions: parsed.openQuestions,
  };
}

/** Create a temp `specs/NNN-slug/spec.md` directory and return its path. */
export async function writeTempSpec(
  dirName = "001-token-visualizer",
  contents = SAMPLE_SPEC,
): Promise<{ specDir: string; repoRoot: string; cleanup: () => Promise<void> }> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sdlc-test-"));
  const specDir = path.join(repoRoot, "specs", dirName);
  await fs.mkdir(specDir, { recursive: true });
  await fs.writeFile(path.join(specDir, "spec.md"), contents, "utf8");
  return {
    specDir,
    repoRoot,
    cleanup: () => fs.rm(repoRoot, { recursive: true, force: true }),
  };
}
