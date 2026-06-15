// Type shim so vite.config.ts (type-checked by tsconfig.node.json, allowJs:false)
// can import the plain-ESM plugin. Runtime impl lives in the sibling .mjs.
import type { Plugin } from "vite";

export interface CopilotLivePluginOptions {
  base?: string;
}

export function copilotLivePlugin(options?: CopilotLivePluginOptions): Plugin;
export default copilotLivePlugin;
