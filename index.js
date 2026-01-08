/**
 * Persona Management Extended
 * Entry point
 */

import { eventSource, event_types } from "/script.js";

import { log, error } from "./src/core/log.js";
import { ensurePersonaManagementUI, refreshAdvancedUIIfVisible } from "./src/ui/personaManagementTab.js";
import { registerGenerateInterceptor } from "./src/injector.js";

function tryInitUI() {
  try {
    return ensurePersonaManagementUI();
  } catch (e) {
    error("UI init failed", e);
    return false;
  }
}

function init() {
  log("Initializing extension...");

  registerGenerateInterceptor();

  // 1) App ready hook (safe point where ST UI exists)
  eventSource.on(event_types.APP_READY, () => {
    setTimeout(() => tryInitUI(), 100);
  });

  // 2) When Persona Management drawer is opened
  document.addEventListener("click", (ev) => {
    const target = /** @type {HTMLElement|null} */ (ev.target instanceof HTMLElement ? ev.target : null);
    if (!target) return;

    // Click may happen on icon inside the drawer, so use closest()
    if (target.closest("#persona-management-button")) {
      setTimeout(() => tryInitUI(), 50);
    }
  });

  // 3) Chat changes may auto-switch persona; refresh our UI if visible
  eventSource.on(event_types.CHAT_CHANGED, () => {
    setTimeout(() => {
      tryInitUI();
      refreshAdvancedUIIfVisible();
    }, 50);
  });

  // 4) Best-effort immediate init if DOM already ready
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(() => tryInitUI(), 50);
  } else {
    document.addEventListener("DOMContentLoaded", () => setTimeout(() => tryInitUI(), 50));
  }

  log("Initialized");
}

try {
  init();
} catch (e) {
  error("Fatal init error", e);
}

