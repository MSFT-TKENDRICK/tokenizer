import { useId, useRef, type FormEvent } from "react";

// Protected token connector for the static website. The published GitHub Pages site
// has no loopback engine and therefore no ambient GitHub auth, so this form lets a
// user paste a GitHub token to unlock the very same Live chat the canvas extension
// gets for free. Security posture:
//   - The input is an uncontrolled password field: the token is read from the DOM on
//     submit, handed straight to the transport client, and the field is cleared. It
//     never lands in React state (so it can't leak through DevTools / error reports)
//     and is never persisted to storage.
//   - The Pages build also ships a `connect-src` CSP limiting where requests (and
//     thus the token) can go to api.github.com / models.github.ai.
// This component is intentionally inert in the canvas/dev builds (gated by the caller
// on a build-time capability flag) so it never weakens the extension's ambient auth.

export interface LiveTokenFormProps {
  active: boolean;
  validating: boolean;
  rejected: boolean;
  servedModelNote: string;
  onConnect: (token: string) => void;
  onForget: () => void;
}

export function LiveTokenForm({ active, validating, rejected, servedModelNote, onConnect, onForget }: LiveTokenFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const noteId = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = inputRef.current?.value.trim() ?? "";
    if (!value) return;
    onConnect(value);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <form className="live-token-form" aria-label="Connect a GitHub token for Live chat" onSubmit={handleSubmit}>
      <label className="live-token-label" htmlFor={inputId}>
        GitHub token
      </label>
      <div className="live-token-row">
        <input
          ref={inputRef}
          id={inputId}
          className="live-token-input"
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="ghp_… or fine-grained token with models:read"
          aria-describedby={noteId}
          aria-invalid={rejected || undefined}
        />
        <button className="live-token-submit" type="submit">
          {active ? "Update" : "Connect"}
        </button>
        {active ? (
          <button className="live-token-forget" type="button" onClick={onForget}>
            Forget
          </button>
        ) : null}
      </div>
      {rejected ? (
        <p className="live-token-error" role="alert">
          Token rejected. Use a valid GitHub token with the <code>models:read</code> scope.
        </p>
      ) : null}
      {validating ? (
        <p className="live-token-hint" role="status" aria-live="polite">
          Validating token…
        </p>
      ) : null}
      <p className="live-token-note" id={noteId}>
        Your token stays in this browser tab&apos;s memory only — it is never stored or sent anywhere except GitHub over
        HTTPS. Prefer a short-lived, minimal-scope token. {servedModelNote}
      </p>
    </form>
  );
}
