// Node-only resolver for the Copilot SDK + CLI runtime, used by BOTH the canvas
// extension and the Vite dev plugin. The SDK ships with the desktop app (not on
// npm, no package.json), and `new CopilotClient()` can't self-locate the runtime
// from an external process — so we must hand it the CLI exe via
// RuntimeConnection.forStdio({ path }). See files/sdk-probe.mjs for the proof.
//
// Returns { cliPath, load } or null (→ Live unavailable, degrade gracefully).
// Never logs tokens or auth.

import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { execSync } from "node:child_process";

function sdkIndexCandidates() {
  const out = [];
  const fromEnv = process.env.COPILOT_SDK_PATH;
  if (fromEnv) {
    out.push(fromEnv.endsWith("index.js") ? fromEnv : join(fromEnv, "index.js"));
  }
  const home = homedir();
  const localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
  out.push(join(localAppData, "Programs", "GitHub Copilot", "copilot-sdk", "index.js"));
  out.push("/Applications/GitHub Copilot.app/Contents/Resources/copilot-sdk/index.js");
  out.push(join(home, ".local", "share", "GitHub Copilot", "copilot-sdk", "index.js"));
  return out;
}

function cliCandidates() {
  const out = [];
  if (process.env.COPILOT_CLI_PATH) out.push(process.env.COPILOT_CLI_PATH);
  const probe = platform() === "win32" ? "where.exe copilot" : "command -v copilot";
  try {
    const found = execSync(probe, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    out.push(...found);
  } catch {
    // copilot not on PATH; fall through to known install locations.
  }
  const home = homedir();
  const localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
  out.push(
    join(
      localAppData,
      "Microsoft",
      "WinGet",
      "Packages",
      "GitHub.Copilot_Microsoft.Winget.Source_8wekyb3d8bbwe",
      "copilot.exe",
    ),
  );
  out.push("/usr/local/bin/copilot");
  out.push("/opt/homebrew/bin/copilot");
  return out;
}

export function resolveSdk() {
  const sdkIndex = sdkIndexCandidates().find((candidate) => existsSync(candidate));
  const cliPath = cliCandidates().find((candidate) => existsSync(candidate));
  if (!sdkIndex || !cliPath) return null;
  return {
    cliPath,
    async load() {
      return import(pathToFileURL(sdkIndex).href);
    },
  };
}
