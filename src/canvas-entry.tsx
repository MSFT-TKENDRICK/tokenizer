import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";

// Canvas entry point. Renders the exact published web app (src/App.tsx) inside
// the GitHub Copilot desktop canvas iframe, so the canvas and the GitHub Pages
// site are the same experience — including the Simulated/Live chat toggle.
//
// Unlike src/main.tsx this does NOT register a service worker: a PWA worker on an
// ephemeral loopback origin is pointless and undesirable inside the canvas. The
// Live engine base is pinned via window.__COPILOT_LIVE_BASE__ in canvas.html.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
