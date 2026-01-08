import { power_user, persona_description_positions } from "/scripts/power-user.js";
import { saveSettingsDebounced } from "/script.js";
import { getTokenCountAsync } from "/scripts/tokenizers.js";
import { getOrCreatePersonaDescriptor } from "/scripts/personas.js";

import { el, setHidden } from "./dom.js";
import { UI_EVENTS } from "../uiBus.js";

function clickNative(id) {
  const node = document.getElementById(id);
  if (node instanceof HTMLElement) node.click();
}

function syncNativePersonaControls() {
  const nativeDesc = document.getElementById("persona_description");
  if (nativeDesc instanceof HTMLTextAreaElement) {
    nativeDesc.value = String(power_user.persona_description ?? "");
  }

  const nativePos = document.getElementById("persona_description_position");
  if (nativePos instanceof HTMLSelectElement) {
    nativePos.value = String(
      Number(
        power_user.persona_description_position ??
          persona_description_positions.IN_PROMPT
      )
    );
  }

  const nativeDepth = document.getElementById("persona_depth_value");
  if (nativeDepth instanceof HTMLInputElement) {
    nativeDepth.value = String(Number(power_user.persona_description_depth ?? 2));
  }

  const nativeRole = document.getElementById("persona_depth_role");
  if (nativeRole instanceof HTMLSelectElement) {
    nativeRole.value = String(Number(power_user.persona_description_role ?? 0));
  }
}

function makeIconButton(title, iconClass, onClick, { danger = false } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `menu_button menu_button_icon pme-icon-btn${
    danger ? " pme-danger" : ""
  }`;
  btn.title = title;
  btn.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

export function createCurrentPersonaPanel({ getPersonaName, bus }) {
  const root = el("div", "pme-card pme-current");

  // Header
  const header = el("div", "pme-current-top");
  const titleEl = el("div", "pme-current-title", "[Persona Name]");
  const buttons = el("div", "pme-current-buttons");

  buttons.appendChild(
    makeIconButton("Rename Persona", "fa-pencil", () => {
      clickNative("persona_rename_button");
      window.setTimeout(() => bus?.emit(UI_EVENTS.PERSONA_LIST_INVALIDATED, {}), 150);
    })
  );
  buttons.appendChild(
    makeIconButton("Click to set user name for all messages", "fa-sync", () =>
      clickNative("sync_name_button")
    )
  );
  buttons.appendChild(
    makeIconButton("Persona Lore", "fa-globe", () =>
      clickNative("persona_lore_button")
    )
  );
  buttons.appendChild(
    makeIconButton("Change Persona Image", "fa-image", () => {
      clickNative("persona_set_image_button");
      window.setTimeout(() => bus?.emit(UI_EVENTS.PERSONA_LIST_INVALIDATED, {}), 250);
    })
  );
  buttons.appendChild(
    makeIconButton("Duplicate Persona", "fa-clone", () => {
      clickNative("persona_duplicate_button");
      window.setTimeout(() => bus?.emit(UI_EVENTS.PERSONA_LIST_INVALIDATED, {}), 250);
    })
  );
  buttons.appendChild(
    makeIconButton(
      "Delete Persona",
      "fa-skull",
      () => {
        clickNative("persona_delete_button");
        window.setTimeout(() => bus?.emit(UI_EVENTS.PERSONA_LIST_INVALIDATED, {}), 350);
      },
      { danger: true }
    )
  );

  header.appendChild(titleEl);
  header.appendChild(buttons);
  root.appendChild(header);

  // Description header
  const descHeader = el("div", "pme-section-header");
  descHeader.appendChild(el("div", "pme-section-title", "Persona Description"));
  const maxBtn = document.createElement("i");
  maxBtn.className = "editor_maximize fa-solid fa-maximize right_menu_button";
  maxBtn.title = "Expand the editor";
  maxBtn.setAttribute("data-for", "pme_persona_description");
  descHeader.appendChild(maxBtn);
  root.appendChild(descHeader);

  const textarea = document.createElement("textarea");
  textarea.id = "pme_persona_description";
  textarea.className = "text_pole textarea_compact pme-current-textarea";
  textarea.rows = 8;
  textarea.placeholder = "Example:\n[{{user}} is a 28-year-old Romanian cat girl.]";
  textarea.autocomplete = "off";
  root.appendChild(textarea);

  // Position + tokens header
  const posHeader = el("div", "pme-position-header");
  posHeader.appendChild(el("div", "pme-section-title", "Position"));
  const tokenBox = el("div", "pme-token-box");
  tokenBox.appendChild(el("span", "", "Tokens: "));
  const tokenCount = el("span", "pme-token-count", "0");
  tokenBox.appendChild(tokenCount);
  posHeader.appendChild(tokenBox);
  root.appendChild(posHeader);

  // Position row
  const posRow = el("div", "pme-position-row");

  const posSelect = document.createElement("select");
  posSelect.className = "pme-position-select";
  posSelect.innerHTML = `
    <option value="${persona_description_positions.NONE}">None (disabled)</option>
    <option value="${persona_description_positions.IN_PROMPT}">In Story String / Prompt Manager</option>
    <option value="${persona_description_positions.TOP_AN}">Top of Author's Note</option>
    <option value="${persona_description_positions.BOTTOM_AN}">Bottom of Author's Note</option>
    <option value="${persona_description_positions.AT_DEPTH}">In-chat @ Depth</option>
  `;
  posRow.appendChild(posSelect);

  const depthWrap = el("div", "pme-depth-wrap");
  const depthLabel = el("label", "pme-depth-label", "Depth:");
  const depthInput = document.createElement("input");
  depthInput.type = "number";
  depthInput.min = "0";
  depthInput.max = "9999";
  depthInput.step = "1";
  depthInput.className = "text_pole pme-depth-input";
  depthLabel.appendChild(depthInput);
  depthWrap.appendChild(depthLabel);

  const roleLabel = el("label", "pme-depth-label", "Role:");
  const roleSelect = document.createElement("select");
  roleSelect.className = "text_pole pme-role-select";
  roleSelect.innerHTML = `
    <option value="0">System</option>
    <option value="1">User</option>
    <option value="2">Assistant</option>
  `;
  roleLabel.appendChild(roleSelect);
  depthWrap.appendChild(roleLabel);

  posRow.appendChild(depthWrap);
  root.appendChild(posRow);

  function updateDepthVisibility() {
    const v = Number(posSelect.value);
    setHidden(depthWrap, v !== persona_description_positions.AT_DEPTH);
  }

  // Token counting (debounced)
  let tokenTimer = /** @type {number|undefined} */ (undefined);
  const refreshTokens = () => {
    if (tokenTimer) window.clearTimeout(tokenTimer);
    tokenTimer = window.setTimeout(async () => {
      try {
        const count = await getTokenCountAsync(String(textarea.value ?? ""));
        tokenCount.textContent = String(count);
      } catch {
        tokenCount.textContent = "0";
      }
    }, 250);
  };

  // Inputs -> ST model
  let lastDescValue = "";
  const onDescInput = () => {
    const next = String(textarea.value ?? "");
    if (next === lastDescValue) return;
    lastDescValue = next;

    power_user.persona_description = next;
    const descriptor = getOrCreatePersonaDescriptor();
    descriptor.description = power_user.persona_description;
    saveSettingsDebounced();
    refreshTokens();
    syncNativePersonaControls();
    bus?.emit(UI_EVENTS.PERSONA_DESC_CHANGED, {});
  };

  textarea.addEventListener("input", onDescInput);
  try {
    // ST "Expand editor" uses jQuery `.trigger('input')` on the original element.
    // Native listener is not guaranteed to receive that trigger, so we bind both.
    // eslint-disable-next-line no-undef
    if (typeof $ === "function") $(textarea).on("input", onDescInput);
  } catch {
    // ignore
  }

  posSelect.addEventListener("input", () => {
    power_user.persona_description_position = Number(posSelect.value);
    const descriptor = getOrCreatePersonaDescriptor();
    descriptor.position = power_user.persona_description_position;
    saveSettingsDebounced();
    updateDepthVisibility();
    syncNativePersonaControls();
  });

  depthInput.addEventListener("input", () => {
    power_user.persona_description_depth = Number(depthInput.value);
    const descriptor = getOrCreatePersonaDescriptor();
    descriptor.depth = power_user.persona_description_depth;
    saveSettingsDebounced();
    syncNativePersonaControls();
  });

  roleSelect.addEventListener("input", () => {
    power_user.persona_description_role = Number(roleSelect.value);
    const descriptor = getOrCreatePersonaDescriptor();
    descriptor.role = power_user.persona_description_role;
    saveSettingsDebounced();
    syncNativePersonaControls();
  });

  return {
    el: root,
    mount() {
      this.update();
    },
    update() {
      // Update header title
      titleEl.textContent = String(getPersonaName?.() ?? "[Persona Name]");

      // Update inputs from ST model
      textarea.value = String(power_user.persona_description ?? "");
      lastDescValue = textarea.value;

      const currentPos = Number(
        power_user.persona_description_position ??
          persona_description_positions.IN_PROMPT
      );
      posSelect.value = String(currentPos);

      depthInput.value = String(Number(power_user.persona_description_depth ?? 2));
      roleSelect.value = String(Number(power_user.persona_description_role ?? 0));
      updateDepthVisibility();
      refreshTokens();
    },
    syncNative() {
      syncNativePersonaControls();
    },
  };
}

