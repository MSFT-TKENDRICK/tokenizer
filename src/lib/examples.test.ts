import { describe, expect, it } from "vitest";

import {
  composeConversationRequest,
  composePrompt,
  promptPatchLayers,
} from "./examples";

describe("prompt examples", () => {
  it("preserves dollar replacements, indentation, line endings, and XML-like input", () => {
    const request = "  keep indentation\r\n$& and $1 stay literal\n<userRequest>not a wrapper</userRequest>";
    const composed = composeConversationRequest([request]);

    expect(composed).toContain(`\n${request}\n`);
    expect(composed).toContain("$& and $1");
    expect(composed).toContain("<userRequest>not a wrapper</userRequest>");
    expect(composed).toContain("\r\n");
  });

  it("keeps environment and memory context opt-in", () => {
    const base = composePrompt([], "hello");
    expect(base).not.toContain("<environment_info>");
    expect(base).not.toContain("<userMemory>");

    const selected = composePrompt(["environment", "memory"], "hello");
    expect(selected).toContain("<environment_info>");
    expect(selected).toContain("<userMemory>");
    expect(promptPatchLayers.map((layer) => layer.id)).toContain("workspace");
  });

  it("adds request metadata once before the conversation history", () => {
    const request = composeConversationRequest(["first message", "second message"], {
      includeAssistantResponses: true,
    });

    expect(request.match(/<attachments>/gu)).toHaveLength(1);
    expect(request.match(/<context>/gu)).toHaveLength(1);
    expect(request.match(/<userRequest>/gu)).toHaveLength(2);
    expect(request.indexOf("<attachments>")).toBeLessThan(request.indexOf("first message"));
    expect(request.indexOf("first message")).toBeLessThan(request.indexOf("Example reply:"));
    expect(request.indexOf("Example reply:")).toBeLessThan(request.indexOf("second message"));
  });
});
