import {
  power_user,
  persona_description_positions,
} from "/scripts/power-user.js";
import { saveSettingsDebounced } from "/script.js";
import { getTokenCountAsync } from "/scripts/tokenizers.js";
import { getOrCreatePersonaDescriptor } from "/scripts/personas.js";
import { openWorldInfoEditor } from "/scripts/world-info.js";
import { callGenericPopup, POPUP_RESULT, POPUP_TYPE } from "/scripts/popup.js";

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
    nativeDepth.value = String(
      Number(power_user.persona_description_depth ?? 2)
    );
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
    onClick(e);
  });
  return btn;
}

export function createCurrentPersonaPanel({ getPersonaName, bus }) {
  const root = el("div", "pme-card pme-current");

  function getDescriptor() {
    return getOrCreatePersonaDescriptor();
  }

  /**
   * @param {any} d
   */
  function ensurePme(d) {
    d.pme ??= {};
    if (typeof d.pme !== "object") d.pme = {};
    // Default: keep legacy behavior (linked) unless explicitly turned off.
    if (typeof d.pme.linkedToNative !== "boolean") d.pme.linkedToNative = true;
    d.pme.local ??= {};
    if (typeof d.pme.local !== "object") d.pme.local = {};
    d.pme.local.description ??= "";
    d.pme.local.position ??= persona_description_positions.IN_PROMPT;
    d.pme.local.depth ??= 2;
    d.pme.local.role ??= 0;
  }

  function isLinked() {
    const d = getDescriptor();
    ensurePme(d);
    return d.pme.linkedToNative !== false;
  }

  function snapshotNativeToLocal() {
    const d = getDescriptor();
    ensurePme(d);
    d.pme.local.description = String(power_user.persona_description ?? "");
    d.pme.local.position = Number(
      power_user.persona_description_position ??
        persona_description_positions.IN_PROMPT
    );
    d.pme.local.depth = Number(power_user.persona_description_depth ?? 2);
    d.pme.local.role = Number(power_user.persona_description_role ?? 0);
  }

  function applyLocalToNative() {
    const d = getDescriptor();
    ensurePme(d);

    power_user.persona_description = String(d.pme.local.description ?? "");
    power_user.persona_description_position = Number(d.pme.local.position);
    power_user.persona_description_depth = Number(d.pme.local.depth);
    power_user.persona_description_role = Number(d.pme.local.role);

    d.description = power_user.persona_description;
    d.position = power_user.persona_description_position;
    d.depth = power_user.persona_description_depth;
    d.role = power_user.persona_description_role;

    saveSettingsDebounced();
    syncNativePersonaControls();
    bus?.emit(UI_EVENTS.PERSONA_DESC_CHANGED, {});
  }

  // Header
  const header = el("div", "pme-current-top");
  const titleEl = el("div", "pme-current-title", "[Persona Name]");
  const buttons = el("div", "pme-current-buttons");

  buttons.appendChild(
    makeIconButton("Rename Persona", "fa-pencil", () => {
      clickNative("persona_rename_button");
      window.setTimeout(
        () => bus?.emit(UI_EVENTS.PERSONA_LIST_INVALIDATED, {}),
        150
      );
    })
  );
  buttons.appendChild(
    makeIconButton("Click to set user name for all messages", "fa-sync", () =>
      clickNative("sync_name_button")
    )
  );

  let panelApi = /** @type {any} */ (null);

  buttons.appendChild(
    makeIconButton(
      "Sync with original persona (toggle)",
      "fa-lock",
      async () => {
        const d = getDescriptor();
        ensurePme(d);
        const linked = isLinked();

        // Turning OFF: detach and snapshot current native values into local storage.
        if (linked) {
          snapshotNativeToLocal();
          d.pme.linkedToNative = false;
          saveSettingsDebounced();
          panelApi?.update();
          return;
        }

        // Turning ON: ask which side becomes canonical.
        // Ensure local has something even if user never edited it.
        if (!d.pme.local?.description) snapshotNativeToLocal();

        const content = el("div", "");
        content.appendChild(
          el(
            "div",
            "",
            "Enable sync with the original persona?\n\nChoose which data should be treated as the source of truth:"
          )
        );

        const result = await callGenericPopup(content, POPUP_TYPE.TEXT, "", {
          okButton: false,
          cancelButton: "Cancel",
          customButtons: [
            { text: "Use original", result: POPUP_RESULT.CUSTOM1 },
            { text: "Use extended", result: POPUP_RESULT.CUSTOM2 },
          ],
        });

        if (result === POPUP_RESULT.CANCELLED) return;

        if (result === POPUP_RESULT.CUSTOM1) {
          // Original wins: overwrite local to match native, then link.
          snapshotNativeToLocal();
          d.pme.linkedToNative = true;
          saveSettingsDebounced();
          panelApi?.update();
          return;
        }

        if (result === POPUP_RESULT.CUSTOM2) {
          // Extended wins: push local -> native, then link.
          d.pme.linkedToNative = true;
          applyLocalToNative();
          panelApi?.update();
        }
      }
    )
  );
  const linkBtn = /** @type {HTMLButtonElement} */ (buttons.lastElementChild);

  buttons.appendChild(
    makeIconButton("Persona Lore", "fa-globe", (e) => {
      // Match native ST behavior: Alt+Click opens the selected lorebook itself.
      const selectedLorebook = String(
        power_user.persona_description_lorebook ?? ""
      ).trim();
      if (e?.altKey && selectedLorebook) {
        openWorldInfoEditor(selectedLorebook);
        return;
      }
      clickNative("persona_lore_button");
    })
  );
  const loreBtn = /** @type {HTMLButtonElement} */ (buttons.lastElementChild);
  buttons.appendChild(
    makeIconButton("Change Persona Image", "fa-image", () => {
      clickNative("persona_set_image_button");
      window.setTimeout(
        () => bus?.emit(UI_EVENTS.PERSONA_LIST_INVALIDATED, {}),
        250
      );
    })
  );
  buttons.appendChild(
    makeIconButton("Duplicate Persona", "fa-clone", () => {
      clickNative("persona_duplicate_button");
      window.setTimeout(
        () => bus?.emit(UI_EVENTS.PERSONA_LIST_INVALIDATED, {}),
        250
      );
    })
  );
  buttons.appendChild(
    makeIconButton(
      "Delete Persona",
      "fa-skull",
      () => {
        clickNative("persona_delete_button");
        window.setTimeout(
          () => bus?.emit(UI_EVENTS.PERSONA_LIST_INVALIDATED, {}),
          350
        );
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
  textarea.placeholder =
    "Example:\n[{{user}} is a 28-year-old Romanian cat girl.]";
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

  function syncLinkButtonState() {
    const linked = isLinked();
    linkBtn?.classList.toggle("world_set", linked);
    const icon = linkBtn?.querySelector("i");
    if (icon)
      icon.className = `fa-solid ${linked ? "fa-lock" : "fa-lock-open"}`;
    linkBtn.title = linked
      ? "Sync with original persona: ON"
      : "Sync with original persona: OFF (editing extended version separately)";
  }

  function syncLorebookState() {
    // Match SillyTavern native behavior: `#persona_lore_button` toggles `.world_set`.
    // `.world_set` is styled in ST as "active/green".
    const hasLorebook = !!String(
      power_user.persona_description_lorebook ?? ""
    ).trim();
    loreBtn?.classList.toggle("world_set", hasLorebook);
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

    const d = getDescriptor();
    ensurePme(d);

    if (isLinked()) {
      power_user.persona_description = next;
      d.description = power_user.persona_description;
      saveSettingsDebounced();
      syncNativePersonaControls();
    } else {
      d.pme.local.description = next;
      saveSettingsDebounced();
    }
    refreshTokens();
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
    const d = getDescriptor();
    ensurePme(d);
    if (isLinked()) {
      power_user.persona_description_position = Number(posSelect.value);
      d.position = power_user.persona_description_position;
      saveSettingsDebounced();
      syncNativePersonaControls();
    } else {
      d.pme.local.position = Number(posSelect.value);
      saveSettingsDebounced();
    }
    updateDepthVisibility();
  });

  depthInput.addEventListener("input", () => {
    const d = getDescriptor();
    ensurePme(d);
    if (isLinked()) {
      power_user.persona_description_depth = Number(depthInput.value);
      d.depth = power_user.persona_description_depth;
      saveSettingsDebounced();
      syncNativePersonaControls();
    } else {
      d.pme.local.depth = Number(depthInput.value);
      saveSettingsDebounced();
    }
  });

  roleSelect.addEventListener("input", () => {
    const d = getDescriptor();
    ensurePme(d);
    if (isLinked()) {
      power_user.persona_description_role = Number(roleSelect.value);
      d.role = power_user.persona_description_role;
      saveSettingsDebounced();
      syncNativePersonaControls();
    } else {
      d.pme.local.role = Number(roleSelect.value);
      saveSettingsDebounced();
    }
  });

  // After opening the native lorebook picker, re-check selection (it may change asynchronously).
  loreBtn?.addEventListener("click", () => {
    window.setTimeout(syncLorebookState, 250);
    window.setTimeout(syncLorebookState, 800);
  });

  panelApi = {
    el: root,
    mount() {
      this.update();
    },
    update() {
      // Update header title
      titleEl.textContent = String(getPersonaName?.() ?? "[Persona Name]");

      const d = getDescriptor();
      ensurePme(d);
      const linked = isLinked();
      syncLinkButtonState();

      // Update inputs from selected source (native or local)
      textarea.value = linked
        ? String(power_user.persona_description ?? "")
        : String(d.pme.local.description ?? "");
      lastDescValue = textarea.value;

      const currentPos = linked
        ? Number(
            power_user.persona_description_position ??
              persona_description_positions.IN_PROMPT
          )
        : Number(
            d.pme.local.position ?? persona_description_positions.IN_PROMPT
          );
      posSelect.value = String(currentPos);

      depthInput.value = String(
        linked
          ? Number(power_user.persona_description_depth ?? 2)
          : Number(d.pme.local.depth ?? 2)
      );
      roleSelect.value = String(
        linked
          ? Number(power_user.persona_description_role ?? 0)
          : Number(d.pme.local.role ?? 0)
      );
      updateDepthVisibility();
      refreshTokens();
      syncLorebookState();
    },
    syncNative() {
      syncNativePersonaControls();
    },
  };

  return panelApi;
}
