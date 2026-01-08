/**
 * Persona Management Extended
 * Entry point
 */

import { eventSource, event_types } from "/script.js";

import { log, error } from "./src/core/log.js";
import {
  ensurePersonaManagementUI,
  refreshAdvancedUIIfVisible,
} from "./src/ui/personaManagementTab.js";
import { registerGenerateInterceptor } from "./src/injector.js";
import { initSettingsUI, loadSettings } from "./settings.js";

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

  // Load persistent extension settings early
  loadSettings();

  registerGenerateInterceptor();

  // 1) App ready hook (safe point where ST UI exists)
  eventSource.on(event_types.APP_READY, () => {
    setTimeout(() => tryInitUI(), 100);
  });

  // 2) When Persona Management drawer is opened
  document.addEventListener("click", (ev) => {
    const target = /** @type {HTMLElement|null} */ (
      ev.target instanceof HTMLElement ? ev.target : null
    );
    if (!target) return;

    // IMPORTANT: only react to drawer header clicks.
    // If we re-init on clicks inside the panel, we will re-render and steal focus from inputs.
    if (target.closest("#persona-management-button .drawer-toggle")) {
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
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    setTimeout(() => tryInitUI(), 50);
  } else {
    document.addEventListener("DOMContentLoaded", () =>
      setTimeout(() => tryInitUI(), 50)
    );
  }

  log("Initialized");
}

try {
  init();
} catch (e) {
  error("Fatal init error", e);
}

// Settings UI is available only after ST loads extension settings screen
try {
  eventSource.on(event_types.EXTENSION_SETTINGS_LOADED, () => {
    setTimeout(initSettingsUI, 200);
  });
} catch (e) {
  // ignore
}
