#!/usr/bin/env node
// Thin launcher for the compiled SDLC CLI.
import { runCli } from "../dist/cli.js";

runCli(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
