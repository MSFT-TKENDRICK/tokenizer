import { describe, expect, it } from "vitest";

import * as tsProtocol from "./protocol";
// The Node engine + iframe client consume the .mjs copy; this app consumes the
// .ts copy. Deep-equal their constant values so the seam can't silently drift.
import * as mjsProtocol from "../../../.github/extensions/tokenizer/web/protocol.mjs";

describe("live protocol parity (protocol.ts <-> protocol.mjs)", () => {
  it("exposes identical LIVE_ENDPOINTS", () => {
    expect({ ...tsProtocol.LIVE_ENDPOINTS }).toEqual({ ...mjsProtocol.LIVE_ENDPOINTS });
  });

  it("exposes identical SSE_EVENTS", () => {
    expect({ ...tsProtocol.SSE_EVENTS }).toEqual({ ...mjsProtocol.SSE_EVENTS });
  });

  it("exposes identical ENGINE_STATUS", () => {
    expect({ ...tsProtocol.ENGINE_STATUS }).toEqual({ ...mjsProtocol.ENGINE_STATUS });
  });

  it("exposes identical SDK_MODEL_ALIASES", () => {
    expect({ ...tsProtocol.SDK_MODEL_ALIASES }).toEqual({ ...mjsProtocol.SDK_MODEL_ALIASES });
  });

  it("maps catalog model ids to SDK ids identically", () => {
    const ids = ["auto", "gemini-3.1-pro", "mai-code-1-flash", "claude-opus-4.8", "gpt-5.5", undefined];
    for (const id of ids) {
      expect(tsProtocol.toSdkModelId(id)).toBe(mjsProtocol.toSdkModelId(id));
    }
  });

  it("joins live paths identically", () => {
    const cases = [
      ["/copilot/live", "status"],
      ["/copilot/live/", "chat"],
      ["/tokenizer/copilot/live", "status"],
      ["/live", "chat"],
    ];
    for (const [base, endpoint] of cases) {
      expect(tsProtocol.joinLivePath(base, endpoint)).toBe(mjsProtocol.joinLivePath(base, endpoint));
    }
  });
});
