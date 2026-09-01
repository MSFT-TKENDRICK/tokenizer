// Simulated | Live response-mode toggle, shared by every surface that renders the
// tokenizer (the GitHub Pages site and the canvas extension both mount App.tsx).
// The DOM here is asserted verbatim by the e2e / a11y / visual specs — a role=group
// labelled "Chat response mode" wrapping two aria-pressed buttons — so keep the
// roles, classes, and labels stable when changing this component.

export type ChatMode = "simulated" | "live";

export interface LiveModeToggleProps {
  isLive: boolean;
  liveDisabled: boolean;
  liveTitle: string;
  onSelect: (mode: ChatMode) => void;
}

export function LiveModeToggle({ isLive, liveDisabled, liveTitle, onSelect }: LiveModeToggleProps) {
  return (
    <div className="mode-toggle" role="group" aria-label="Chat response mode">
      <button
        aria-pressed={!isLive}
        className={!isLive ? "active" : ""}
        type="button"
        title="Use the built-in simulated conversation"
        onClick={() => onSelect("simulated")}
      >
        Simulated
      </button>
      <button
        aria-pressed={isLive}
        className={isLive ? "active" : ""}
        type="button"
        disabled={liveDisabled}
        title={liveTitle}
        onClick={() => onSelect("live")}
      >
        Live
      </button>
    </div>
  );
}
