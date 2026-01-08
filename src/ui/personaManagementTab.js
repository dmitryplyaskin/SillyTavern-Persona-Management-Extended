import { user_avatar } from "/scripts/personas.js";
import { power_user } from "/scripts/power-user.js";

import { PME } from "../core/constants.js";
import { getAdvancedModeEnabled, setAdvancedModeEnabled } from "../core/mode.js";
import { log, warn } from "../core/log.js";

function getPersonaName(avatarId) {
  return power_user?.personas?.[avatarId] ?? avatarId ?? "";
}

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

function renderAdvancedUI(root) {
  const personaName = getPersonaName(user_avatar);
  root.innerHTML = `
    <div class="pme-panel">
      <div class="pme-header">
        <div class="pme-title">Persona Management Extended</div>
        <div class="pme-subtitle">Advanced mode is enabled</div>
      </div>

      <div class="pme-card">
        <div class="pme-card-title">Current persona</div>
        <div class="pme-card-body">
          <div><strong>Name:</strong> ${escapeHtml(personaName)}</div>
          <div><strong>AvatarId:</strong> ${escapeHtml(String(user_avatar ?? ""))}</div>
        </div>
      </div>

      <div class="pme-card">
        <div class="pme-card-title">Next steps</div>
        <div class="pme-card-body">
          <ol class="pme-list">
            <li>Groups & items model (persist in <code>power_user.persona_descriptions[avatarId].pme</code>)</li>
            <li>Group/item editor UI</li>
            <li>Generation-time injection via <code>generate_interceptor</code> with safe rollback</li>
            <li>Chat / character bindings (overrides)</li>
          </ol>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function applyMode() {
  const container = getPersonaManagementRoot();
  if (!container) return;

  const advancedEnabled = getAdvancedModeEnabled();

  const defaultBlock = getDefaultBlock();
  if (defaultBlock) {
    defaultBlock.classList.toggle("displayNone", advancedEnabled);
  }

  const root = getOrCreateAdvancedRoot(container);
  root.classList.toggle("displayNone", !advancedEnabled);

  if (advancedEnabled) {
    renderAdvancedUI(root);
  }
}

export function ensurePersonaManagementUI() {
  const container = getPersonaManagementRoot();
  if (!container) {
    return false;
  }

  ensureAdvancedToggle();
  getOrCreateAdvancedRoot(container);
  applyMode();

  return true;
}

export function refreshAdvancedUIIfVisible() {
  const root = document.getElementById(PME.dom.rootId);
  if (!root) return;
  if (root.classList.contains("displayNone")) return;

  try {
    renderAdvancedUI(root);
  } catch (e) {
    warn("Failed to refresh advanced UI", e);
  }
}

