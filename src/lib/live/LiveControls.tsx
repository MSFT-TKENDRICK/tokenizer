// The full Live control surface — mode toggle, status badge, and (website-only)
// token connector — composed into the mode bar. App.tsx renders exactly this on
// every surface, so the Simulated|Live experience is shared rather than duplicated.

import { LiveModeToggle, type ChatMode } from "./LiveModeToggle";
import { LiveStatusBadge, type LiveStatusTone } from "./LiveStatusBadge";
import { LiveTokenForm } from "./LiveTokenForm";

export interface LiveControlsProps {
  isLive: boolean;
  liveDisabled: boolean;
  liveTitle: string;
  onSelectMode: (mode: ChatMode) => void;
  statusTone: LiveStatusTone;
  statusMessage: string;
  showTokenForm: boolean;
  tokenActive: boolean;
  tokenValidating: boolean;
  tokenRejected: boolean;
  servedModelNote: string;
  onConnectToken: (token: string) => void;
  onForgetToken: () => void;
}

export function LiveControls({
  isLive,
  liveDisabled,
  liveTitle,
  onSelectMode,
  statusTone,
  statusMessage,
  showTokenForm,
  tokenActive,
  tokenValidating,
  tokenRejected,
  servedModelNote,
  onConnectToken,
  onForgetToken,
}: LiveControlsProps) {
  return (
    <div className="mode-bar">
      <LiveModeToggle isLive={isLive} liveDisabled={liveDisabled} liveTitle={liveTitle} onSelect={onSelectMode} />
      {isLive && statusMessage ? <LiveStatusBadge tone={statusTone} message={statusMessage} /> : null}
      {showTokenForm ? (
        <LiveTokenForm
          active={tokenActive}
          validating={tokenValidating}
          rejected={tokenRejected}
          servedModelNote={servedModelNote}
          onConnect={onConnectToken}
          onForget={onForgetToken}
        />
      ) : null}
    </div>
  );
}
