export interface PromptPatchLayer {
  id: string;
  name: string;
  description: string;
  content: string;
}

const baseSystem = `<system>
You are an expert AI programming assistant, working with a user in the VS Code editor.
Your name is GitHub Copilot.
Follow Microsoft content policies.
Avoid content that violates copyrights.
If asked to generate harmful, hateful, racist, sexist, lewd, or violent content, refuse.

<coding_agent_instructions>
You are a coding agent running in VS Code. You are expected to be precise, safe, and helpful.
Your capabilities:
- Receive user prompts and workspace context.
- Communicate with the user by streaming responses and plans.
- Emit function calls when tools are available.
</coding_agent_instructions>

<working_with_the_user>
You interact with the user through a terminal.
Share short intermediary updates while working.
Persist until the user's request is fully resolved.
</working_with_the_user>
</system>`;

const userRequest = `<userRequest>
Update the shopping cart so signed-in users can add products, edit quantities, remove items, and see the order total before checkout.
</userRequest>`;

export const promptPatchLayers: readonly PromptPatchLayer[] = [
  {
    id: "workspace",
    name: "Workspace",
    description: "Adds OS, repository shape, and runnable task context.",
    content: `<workspace_info>
The user's current OS is: Windows.
Workspace folder: C:\\workspace\\GitHubCopilot_Customized
Repository shape:
- package.json
- api/package.json
- api/src/routes/product.ts
- api/src/routes/order.ts
- frontend/package.json
- frontend/src/App.tsx
- frontend/src/components/entity/product/Products.tsx
- frontend/src/components/entity/product/ProductForm.tsx
Runnable tasks:
- Build API: npm run build --workspace=api
- Build Frontend: npm run build --workspace=frontend
</workspace_info>`,
  },
  {
    id: "agents-md",
    name: "AGENTS.md",
    description: "Adds one autonomous-agent instruction file.",
    content: `<instructions>
<instruction>
<file>AGENTS.md</file>
<description>Repository instructions for autonomous coding agents.</description>
<content>
# AGENTS.md
- Use Windows paths when running commands in this workspace.
- Preserve user changes and never reset the worktree.
- Before editing, inspect the relevant API route, frontend component, and tests.
- Validate with npm test, npm run build --workspace=api, and npm run build --workspace=frontend.
- Keep UI copy concise and accessible.
</content>
</instruction>
</instructions>`,
  },
  {
    id: "repo-instructions",
    name: "Repo instructions",
    description: "Adds one repository-wide Copilot instruction file.",
    content: `<instructions>
<instruction>
<file>.github/copilot-instructions.md</file>
<description>Repository-wide custom instructions for GitHub Copilot.</description>
<content>
This repository is a TypeScript monorepo with an Express API and Vite frontend.
Use existing route conventions in api/src/routes.
Use existing React component patterns in frontend/src/components.
Do not add new package managers or formatting tools.
Run both workspace builds before finishing.
</content>
</instruction>
</instructions>`,
  },
  {
    id: "one-skill",
    name: "1 skill",
    description: "Adds one agent skill manifest entry.",
    content: `<skills>
Here is a list of skills that contain domain specific knowledge.
When the user's task falls within a skill domain, read the skill file before acting.
<skill>
<name>web-design-reviewer</name>
<description>Review and remediate website UI issues through browser-driven inspection and source-level fixes across responsive layouts, accessibility, and visual consistency. Use when asked to review website design, check UI, fix layout issues, inspect accessibility contrast, or validate responsive behavior.</description>
<file>C:\\Users\\developer\\.copilot\\skills\\web-design-reviewer\\SKILL.md</file>
</skill>
</skills>`,
  },
  {
    id: "one-mcp-tool",
    name: "1 MCP tool",
    description: "Adds one GitHub MCP tool instruction block.",
    content: `<instruction forToolsWithPrefix="mcp_github">
# GitHub MCP Server
Use this server for GitHub repository, issue, pull request, commit, and workflow context.

## Tools
### github_get_pull_request
Fetch a pull request by owner, repo, and pull request number.
- Use when the user asks about PR status, changed files, checks, or review comments.
- Return concise findings with links and actionable next steps.
</instruction>`,
  },
  {
    id: "custom-agent",
    name: "Custom agent",
    description: "Adds one Copilot custom agent entry.",
    content: `<agents>
Here is a list of agents that can be used when running a subagent.
Choose the most appropriate agent when asked to run a subagent.
<agent>
<name>SecurityReviewer</name>
<description>Reviews code for known security vulnerabilities and suggests concrete fixes. Use for authentication, authorization, dependency, injection, secret-handling, and data exposure reviews.</description>
<argumentHint>Provide the code, diff, or repository area to review for security vulnerabilities.</argumentHint>
</agent>
</agents>`,
  },
  {
    id: "terminal-context",
    name: "Terminal",
    description: "Adds one current terminal/session context block.",
    content: `<context>
Current date: 2026-06-04.
Terminals:
- Terminal: pwsh
- Last command: npm run build --workspace=frontend
- Cwd: C:\\workspace\\GitHubCopilot_Customized
- Exit code: 0
</context>`,
  },
];

export function composePrompt(selectedLayerIds: readonly string[]) {
  const selected = new Set(selectedLayerIds);
  const sections = [
    baseSystem,
    ...promptPatchLayers
      .filter((layer) => selected.has(layer.id))
      .map((layer) => layer.content),
    userRequest,
  ];

  return sections.join("\n\n");
}

export function createPatchDiff(layer: PromptPatchLayer) {
  const additions = layer.content.split("\n").map((line) => `+${line}`);
  return [
    `diff --git a/copilot-prompt.trace b/copilot-prompt.trace`,
    `--- a/copilot-prompt.trace`,
    `+++ b/copilot-prompt.trace`,
    `@@ insert ${layer.id} before <userRequest> @@`,
    ...additions,
  ].join("\n");
}
