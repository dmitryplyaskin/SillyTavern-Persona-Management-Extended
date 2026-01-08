import { setPersonaDescription } from "/scripts/personas.js";

import { PME } from "../core/constants.js";
import {
  getAdvancedModeEnabled,
  setAdvancedModeEnabled,
} from "../core/mode.js";
import { log, warn } from "../core/log.js";
import { createAdvancedApp } from "./advancedApp.js";

function getPersonaManagementRoot() {
  return document.getElementById("PersonaManagement");
}

function getDefaultBlock() {
  return document.getElementById("persona-management-block");
}

function getOrCreateAdvancedRoot(container) {
  let root = document.getElementById(PME.dom.rootId);
  if (root) return root;

  root = document.createElement("div");
  root.id = PME.dom.rootId;
  root.className = PME.dom.rootClass;
  root.setAttribute("data-pme", "root");
  container.appendChild(root);
  return root;
}

function ensureAdvancedToggle() {
  if (document.getElementById(PME.dom.advancedToggleId)) {
    return;
  }

  const restoreBtn = document.getElementById("personas_restore");
  const buttonBar = restoreBtn?.parentElement;

  if (!buttonBar) {
    // UI not ready yet
    return;
  }

  const label = document.createElement("label");
  label.className = "checkbox_label flexNoGap";
  label.title = "Switch between Normal and Advanced Persona Management UI";
  label.style.marginLeft = "10px";
  label.style.userSelect = "none";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = PME.dom.advancedToggleId;
  input.checked = getAdvancedModeEnabled();

  const text = document.createElement("span");
  text.textContent = "Advanced";

  label.appendChild(input);
  label.appendChild(text);
  buttonBar.appendChild(label);

  input.addEventListener("input", () => {
    setAdvancedModeEnabled(input.checked);
    applyMode();
  });

  log("Advanced mode toggle injected into Persona Management header");
}

let nativePersonaListObserver = /** @type {MutationObserver|null} */ (null);
let wasPersonaDrawerOpen = false;
let personaDrawerObserver = /** @type {MutationObserver|null} */ (null);
let app = /** @type {ReturnType<typeof createAdvancedApp>|null} */ (null);

function getOrCreateApp(root) {
  if (app) return app;
  app = createAdvancedApp(root);
  return app;
}

export function applyMode() {
  const container = getPersonaManagementRoot();
  if (!container) return;

  const advancedEnabled = getAdvancedModeEnabled();

  // Drawer open/close state (so we can auto-scroll only when the UI is opened)
  const drawerOpen = !container.classList.contains("closedDrawer");
  const openingDrawerNow = drawerOpen && !wasPersonaDrawerOpen;
  wasPersonaDrawerOpen = drawerOpen;

  const defaultBlock = getDefaultBlock();
  if (defaultBlock) {
    defaultBlock.classList.toggle("displayNone", advancedEnabled);
  }

  const root = getOrCreateAdvancedRoot(container);
  const wasVisible = !root.classList.contains("displayNone");
  root.classList.toggle("displayNone", !advancedEnabled);

  if (advancedEnabled) {
    const autoScroll = !wasVisible || openingDrawerNow;
    getOrCreateApp(root).open({ autoScroll });
  } else {
    // Put back native blocks and clean up our UI when returning to Normal mode
    try {
      app?.destroy();
    } finally {
      app = null;
    }

    // When going back to Normal mode, sync native UI from power_user
    try {
      setPersonaDescription();
    } catch {
      // ignore
    }
  }
}

export function ensurePersonaManagementUI() {
  const container = getPersonaManagementRoot();
  if (!container) {
    return false;
  }

  // Track drawer open/close so auto-scroll happens only on open.
  // This also fixes the case when the drawer is closed and reopened without our code running in-between.
  if (!personaDrawerObserver) {
    personaDrawerObserver = new MutationObserver(() => {
      const drawerOpen = !container.classList.contains("closedDrawer");
      const openedNow = drawerOpen && !wasPersonaDrawerOpen;
      wasPersonaDrawerOpen = drawerOpen;

      if (openedNow && getAdvancedModeEnabled()) {
        const root = document.getElementById(PME.dom.rootId);
        if (!(root instanceof HTMLElement)) return;
        if (root.classList.contains("displayNone")) return;
        getOrCreateApp(root).open({ autoScroll: true });
      }
    });
    personaDrawerObserver.observe(container, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  ensureAdvancedToggle();
  getOrCreateAdvancedRoot(container);

  // Observe native persona list updates and mirror them
  if (!nativePersonaListObserver) {
    const nativeList = document.getElementById("user_avatar_block");
    if (nativeList) {
      nativePersonaListObserver = new MutationObserver(() => {
        if (!getAdvancedModeEnabled()) return;
        const root = document.getElementById(PME.dom.rootId);
        if (!(root instanceof HTMLElement)) return;
        if (root.classList.contains("displayNone")) return;
        getOrCreateApp(root).refreshPersonas({ invalidateCache: true });
      });
      nativePersonaListObserver.observe(nativeList, {
        childList: true,
        subtree: true,
      });
    }
  }

  applyMode();

  return true;
}

export function refreshAdvancedUIIfVisible() {
  const root = document.getElementById(PME.dom.rootId);
  if (!root) return;
  if (root.classList.contains("displayNone")) return;

  try {
    getOrCreateApp(root).refreshAll();
  } catch (e) {
    warn("Failed to refresh advanced UI", e);
  }
}
