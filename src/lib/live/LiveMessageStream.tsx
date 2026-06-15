import { useSyncExternalStore } from "react";

import type { UseLiveChat } from "./useLiveChat";

interface LiveMessageStreamProps {
  turnIndex: number;
  live: UseLiveChat;
  label: string;
}

// Renders the in-flight Live response. Subscribes to the hook's rAF-coalesced
// stream buffer via useSyncExternalStore so streaming deltas re-render ONLY this
// component, never the whole App (keeps token/invoice memos stable until done).
export function LiveMessageStream({ turnIndex, live, label }: LiveMessageStreamProps) {
  useSyncExternalStore(live.subscribeStream, live.getStreamVersion, live.getStreamVersion);
  const text = live.readStream(turnIndex);

  return (
    <article className="chat-message chat-message-assistant chat-message-live" aria-live="polite">
      <span className="chat-message-label">{label} · streaming</span>
      <p>
        {text}
        <span className="chat-stream-cursor" aria-hidden="true" />
      </p>
    </article>
  );
}
