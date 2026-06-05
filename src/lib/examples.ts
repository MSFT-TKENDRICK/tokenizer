export interface PromptPatchLayer {
  id: string;
  name: string;
  icon: string;
  description: string;
  content: string;
}

export interface PromptSection {
  id: string;
  label: string;
  content: string;
}

export const baseSystem = `<system>
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

const userPromptOneRaw = `<environment_info>
The user's current OS is: Windows
</environment_info>
<workspace_info>
Workspace folder: c:\\src\\GitHubCopilot_Customized
Runnable tasks:
- Build API: npm run build --workspace=api
- Build Frontend: npm run build --workspace=frontend
Repository structure includes api/src/routes, frontend/src/components, specs/002-shopping-cart, and tests.
</workspace_info>
<userMemory>
- When a user asks to exclude a file from gitignore rules, add or preserve a negation rule.
</userMemory>
<sessionMemory>
Session memory (/memories/session/) is empty. No session notes have been created yet.
</sessionMemory>
<repoMemory>
The following files exist in your repository memory (/memories/repo/). These are scoped to the current workspace. Use the memory tool to read them if needed.

/memories/repo/improve-skill-self-optimization.md
</repoMemory>`;

const userPromptTwoRaw = `<attachments>
<attachment id="Browser Pages">
No browser pages are currently shared with you.
</attachment>
</attachments>
<context>
The current date is 2026-06-04.
Terminals:
- pwsh in C:\\src\\GitHubCopilot_Customized
</context>
<userRequest>
tell me something new
</userRequest>`;

export const defaultUserRequest = extractTaggedContent(userPromptTwoRaw, "userRequest") ?? "tell me something new";

export const conversationUserRequests = [
  defaultUserRequest,
  "Using the prior workspace context, explain the next implementation step.",
] as const;

export const conversationAssistantResponses = [
  `Picking a genuinely fresh, useful fact: I'll share a recent practical update you can actually use right away.

A new and useful thing: modern browsers now support CSS container queries widely, which means components can adapt based on their own width, not just the viewport.

That lets you build reusable UI pieces that behave correctly wherever they're placed, without tons of breakpoint hacks. For responsive design, this is one of the biggest shifts since Flexbox/Grid.`,
  "The next implementation step is to inspect the changed files, identify the smallest safe edit, update the relevant test coverage, and run the existing validation commands before summarizing the result.",
] as const;

export function assistantResponseForTurn(turnIndex: number) {
  return conversationAssistantResponses[turnIndex] ?? "I would answer using the submitted user request and the current prompt context.";
}

export const promptPatchLayers: readonly PromptPatchLayer[] = [
  {
    id: "workspace",
    name: "Workspace",
    icon: "folder",
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
    id: "instructions",
    name: "Instructions",
    icon: "book",
    description: "Adds AGENTS.md and repository-wide Copilot instructions.",
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
    id: "tools",
    name: "Tools",
    icon: "tools",
    description: "Adds one agent skill and one MCP tool instruction block.",
    content: `<skills>
Here is a list of skills that contain domain specific knowledge.
When the user's task falls within a skill domain, read the skill file before acting.
<skill>
<name>web-design-reviewer</name>
<description>Review and remediate website UI issues through browser-driven inspection and source-level fixes across responsive layouts, accessibility, and visual consistency. Use when asked to review website design, check UI, fix layout issues, inspect accessibility contrast, or validate responsive behavior.</description>
<file>C:\\Users\\developer\\.copilot\\skills\\web-design-reviewer\\SKILL.md</file>
</skill>
</skills>

<instruction forToolsWithPrefix="mcp_github">
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
    icon: "agent",
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
];

export function getPromptSections(selectedLayerIds: readonly string[], userRequest = defaultUserRequest): PromptSection[] {
  const selected = new Set(selectedLayerIds);
  const sections: PromptSection[] = [
    { id: "system", label: "System prompt", content: formatPromptXml(baseSystem) },
    ...promptPatchLayers
      .filter((layer) => selected.has(layer.id))
      .map((layer) => ({
        id: layer.id,
        label: layer.id === "instructions" ? "Custom instructions" : layer.name,
        content: formatPromptXml(layer.content),
      })),
  ];

  if (userRequest.trim().length > 0) {
    const trimmedUserRequest = userRequest.trim();
    sections.push({
      id: "user",
      label: "User message",
      content: formatPromptXml(trimmedUserRequest.startsWith("<")
        ? trimmedUserRequest
        : `<userRequest>
${userRequest}
</userRequest>`),
    });
  }

  return sections;
}

export function composePrompt(selectedLayerIds: readonly string[], userRequest = defaultUserRequest) {
  return getPromptSections(selectedLayerIds, userRequest)
    .map((section) => section.content)
    .join("\n\n");
}

export function composeConversationRequest(messages: readonly string[], options: { includeAssistantResponses?: boolean } = {}) {
  if (messages.length === 0) {
    return "";
  }

  return messages.map((message, index) => [
    userPromptOneRaw,
    replaceTaggedContent(userPromptTwoRaw, "userRequest", message),
    ...(options.includeAssistantResponses ? [assistantResponseForTurn(index)] : []),
  ].join("\n\n")).join("\n\n");
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

function formatPromptXml(value: string) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  let depth = 0;

  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        return "";
      }

      if (isClosingTag(trimmed)) {
        depth = Math.max(depth - 1, 0);
      }

      const formatted = `${"  ".repeat(depth)}${trimmed}`;

      if (isOpeningTag(trimmed)) {
        depth += 1;
      }

      return formatted;
    })
    .join("\n");
}

function isClosingTag(value: string) {
  return /^<\/[\w:-]+>$/.test(value);
}

function isOpeningTag(value: string) {
  return /^<[\w:-]+(?:\s+[^>]*)?>$/.test(value) && !value.endsWith("/>") && !value.includes("</");
}

function extractTaggedContent(value: string, tagName: string) {
  const pattern = new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*<\\/${tagName}>`);
  return value.match(pattern)?.[1]?.trim();
}

function replaceTaggedContent(value: string, tagName: string, replacement: string) {
  const pattern = new RegExp(`(<${tagName}>)[\\s\\S]*?(<\\/${tagName}>)`);
  return value.replace(pattern, `$1\n${replacement}\n$2`);
}

function stripCacheControl(value: string) {
  return value
    .replace(/\n*\[copilot_cache_control:[^\]]+\]\s*/g, "")
    .replace(/\r\n?/g, "\n");
}
