import { PME } from "./core/constants.js";
import { log } from "./core/log.js";

/**
 * Register a generate interceptor hook.
 *
 * Right now this is a NO-OP placeholder.
 * We register it early so later we can switch to prompt-safe injection
 * without refactoring entrypoints.
 */
export function registerGenerateInterceptor() {
  if (typeof globalThis[PME.interceptor.globalKey] === "function") {
    return;
  }

  globalThis[PME.interceptor.globalKey] = async (_chat, _contextSize, _abort, _type) => {
    // Intentionally empty for now.
  };

  log(`Registered generate interceptor: globalThis.${PME.interceptor.globalKey} (no-op)`);
}

