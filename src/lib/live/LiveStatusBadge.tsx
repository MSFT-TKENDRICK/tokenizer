// Live status line shared across surfaces. Mirrors the original App.tsx markup: a
// polite status region with a tone class (error | ready | warming) and a decorative
// dot. The visual specs key off the `live-status` / `live-status-{tone}` classes.

export type LiveStatusTone = "error" | "ready" | "warming";

export interface LiveStatusBadgeProps {
  tone: LiveStatusTone;
  message: string;
}

export function LiveStatusBadge({ tone, message }: LiveStatusBadgeProps) {
  return (
    <p className={`live-status live-status-${tone}`} role="status" aria-live="polite">
      <span className="live-status-dot" aria-hidden="true" />
      {message}
    </p>
  );
}
