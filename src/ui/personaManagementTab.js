import { power_user } from "/scripts/power-user.js";
import {
  getUserAvatars,
  setPersonaDescription,
  setUserAvatar,
  user_avatar,
} from "/scripts/personas.js";
import { getThumbnailUrl, saveSettingsDebounced } from "/script.js";
import { getTokenCountAsync } from "/scripts/tokenizers.js";
import { persona_description_positions } from "/scripts/power-user.js";
import { getOrCreatePersonaDescriptor } from "/scripts/personas.js";

import { PME } from "../core/constants.js";
import {
  getAdvancedModeEnabled,
  getPersonaSortMode,
  setAdvancedModeEnabled,
  setPersonaSortMode,
} from "../core/mode.js";
import { log, warn } from "../core/log.js";
import {
  addItem,
  listItems,
  patchItem,
  removeItem,
  getCurrentPersonaMeta,
} from "../store/personaStore.js";

function getPersonaName(avatarId) {
  return power_user?.personas?.[avatarId] ?? avatarId ?? "";
}

function getPersonaDescriptionPreview(avatarId) {
  const raw = power_user?.persona_descriptions?.[avatarId]?.description ?? "";
  const text = String(raw).trim().replaceAll("\n", " ");
  if (!text) return "";
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

function getPersonaTitle(avatarId) {
  const raw = power_user?.persona_descriptions?.[avatarId]?.title ?? "";
  return String(raw ?? "").trim();
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

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let personasCache = /** @type {string[]|null} */ (null);
let personasLoadPromise = /** @type {Promise<string[]>|null} */ (null);
let autoScrollToActiveNext = false;

let personaListState =
  /** @type {{listEl: HTMLElement, searchEl: HTMLInputElement, countEl: HTMLElement}|null} */ (
    null
  );

let nativePersonaListObserver = /** @type {MutationObserver|null} */ (null);
let refreshListTimer = /** @type {number|undefined} */ (undefined);

function schedulePersonaListRefresh({ autoScroll = false } = {}) {
  autoScrollToActiveNext ||= autoScroll;
  if (refreshListTimer) window.clearTimeout(refreshListTimer);
  refreshListTimer = window.setTimeout(() => {
    refreshListTimer = undefined;
    if (!personaListState) return;
    personasCache = null;
    void populatePersonaList(
      personaListState.listEl,
      personaListState.searchEl.value,
      personaListState.countEl,
      { autoScroll: autoScrollToActiveNext }
    );
    autoScrollToActiveNext = false;
  }, 150);
}

async function loadPersonas() {
  if (personasCache) return personasCache;
  if (personasLoadPromise) return personasLoadPromise;

  personasLoadPromise = (async () => {
    const list = await getUserAvatars(false);
    const raw = [...(Array.isArray(list) ? list : [])];
    personasCache = raw;
    return raw;
  })().finally(() => {
    personasLoadPromise = null;
  });

  return personasLoadPromise;
}

function renderAdvancedUI(root) {
  root.innerHTML = "";

  const panel = el("div", "pme-panel");

  const header = el("div", "pme-header");
  header.appendChild(el("div", "pme-title", "Persona Management Extended"));
  panel.appendChild(header);

  const layout = el("div", "pme-layout");
  const left = el("div", "pme-left");
  const right = el("div", "pme-right");

  left.appendChild(renderPersonaListBlock());

  right.appendChild(renderCurrentPersonaPanel());

  right.appendChild(renderAdditionalDescriptionsBlock());

  layout.appendChild(left);
  layout.appendChild(right);
  panel.appendChild(layout);

  root.appendChild(panel);
}

function clickNative(id) {
  const el = document.getElementById(id);
  if (el instanceof HTMLElement) el.click();
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

function renderCurrentPersonaPanel() {
  const { avatarId } = getCurrentPersonaMeta();
  const personaName = getPersonaName(avatarId);

  const card = el("div", "pme-card pme-current");
  const header = el("div", "pme-current-top");

  const title = el("div", "pme-current-title", "Current Persona");
  header.appendChild(title);

  const buttons = el("div", "pme-current-buttons");
  buttons.appendChild(
    makeIconButton("Rename Persona", "fa-pencil", () =>
      clickNative("persona_rename_button")
    )
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
    makeIconButton("Change Persona Image", "fa-image", () =>
      clickNative("persona_set_image_button")
    )
  );
  buttons.appendChild(
    makeIconButton("Duplicate Persona", "fa-clone", () =>
      clickNative("persona_duplicate_button")
    )
  );
  buttons.appendChild(
    makeIconButton(
      "Delete Persona",
      "fa-skull",
      () => clickNative("persona_delete_button"),
      { danger: true }
    )
  );
  header.appendChild(buttons);
  card.appendChild(header);

  const nameRow = el("div", "pme-current-name-row");
  nameRow.appendChild(
    el("div", "pme-current-name", personaName || "[Persona Name]")
  );
  card.appendChild(nameRow);

  // Description
  const descHeader = el("div", "pme-section-header");
  descHeader.appendChild(el("div", "pme-section-title", "Persona Description"));
  const maxBtn = document.createElement("i");
  maxBtn.className = "editor_maximize fa-solid fa-maximize right_menu_button";
  maxBtn.title = "Expand the editor";
  maxBtn.setAttribute("data-for", "pme_persona_description");
  descHeader.appendChild(maxBtn);
  card.appendChild(descHeader);

  const textarea = document.createElement("textarea");
  textarea.id = "pme_persona_description";
  textarea.className = "text_pole textarea_compact pme-current-textarea";
  textarea.rows = 8;
  textarea.value = String(power_user.persona_description ?? "");
  textarea.placeholder =
    "Example:\n[{{user}} is a 28-year-old Romanian cat girl.]";
  textarea.autocomplete = "off";
  card.appendChild(textarea);

  // Position + tokens
  const posHeader = el("div", "pme-position-header");
  posHeader.appendChild(el("div", "pme-section-title", "Position"));
  const tokenBox = el("div", "pme-token-box");
  tokenBox.appendChild(el("span", "", "Tokens: "));
  const tokenCount = el("span", "pme-token-count", "0");
  tokenBox.appendChild(tokenCount);
  posHeader.appendChild(tokenBox);
  card.appendChild(posHeader);

  const posRow = el("div", "pme-position-row");
  const select = document.createElement("select");
  select.className = "pme-position-select";
  select.innerHTML = `
    <option value="${persona_description_positions.NONE}">None (disabled)</option>
    <option value="${persona_description_positions.IN_PROMPT}">In Story String / Prompt Manager</option>
    <option value="${persona_description_positions.TOP_AN}">Top of Author's Note</option>
    <option value="${persona_description_positions.BOTTOM_AN}">Bottom of Author's Note</option>
    <option value="${persona_description_positions.AT_DEPTH}">In-chat @ Depth</option>
  `;

  // ST uses power_user.persona_description_position
  const currentPos = Number(
    power_user.persona_description_position ??
      persona_description_positions.IN_PROMPT
  );
  select.value = String(currentPos);
  posRow.appendChild(select);

  const depthWrap = el("div", "pme-depth-wrap");
  const depthLabel = el("label", "pme-depth-label", "Depth:");
  const depthInput = document.createElement("input");
  depthInput.type = "number";
  depthInput.min = "0";
  depthInput.max = "9999";
  depthInput.step = "1";
  depthInput.className = "text_pole pme-depth-input";
  depthInput.value = String(Number(power_user.persona_description_depth ?? 2));
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
  roleSelect.value = String(Number(power_user.persona_description_role ?? 0));
  roleLabel.appendChild(roleSelect);
  depthWrap.appendChild(roleLabel);
  posRow.appendChild(depthWrap);

  card.appendChild(posRow);

  const updateDepthVisibility = () => {
    const v = Number(select.value);
    depthWrap.classList.toggle(
      "displayNone",
      v !== persona_description_positions.AT_DEPTH
    );
  };
  updateDepthVisibility();

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
  refreshTokens();

  // Wire inputs to ST data model
  textarea.addEventListener("input", () => {
    power_user.persona_description = String(textarea.value);
    const descriptor = getOrCreatePersonaDescriptor();
    descriptor.description = power_user.persona_description;
    saveSettingsDebounced();
    refreshTokens();

    syncNativePersonaControls();
  });

  select.addEventListener("input", () => {
    power_user.persona_description_position = Number(select.value);
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

  return card;
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
    // Some actions (rename/image/duplicate/delete) update persona list asynchronously.
    // Schedule list refresh to avoid manual refresh button.
    schedulePersonaListRefresh({ autoScroll: true });
  });
  return btn;
}

function renderPersonaListBlock() {
  const block = el("div", "pme-card pme-personas");

  const header = el("div", "pme-card-title-row");
  const titleWrap = el("div", "pme-card-title");
  titleWrap.textContent = "Personas ";
  const countEl = el("span", "pme-count", "(0)");
  titleWrap.appendChild(countEl);
  header.appendChild(titleWrap);

  const actions = el("div", "pme-actions");

  const refreshBtn = el("button", "menu_button menu_button_icon");
  refreshBtn.type = "button";
  refreshBtn.title = "Refresh list";
  refreshBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
  refreshBtn.addEventListener("click", async () => {
    personasCache = null;
    await populatePersonaList(list, search.value, countEl);
  });
  actions.appendChild(refreshBtn);
  header.appendChild(actions);
  block.appendChild(header);

  const controls = el("div", "pme-persona-controls");

  const search = el("input", "text_pole pme-persona-search");
  search.type = "search";
  search.placeholder = "Search...";
  let searchTimer = /** @type {number|undefined} */ (undefined);
  search.addEventListener("input", () => {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      searchTimer = undefined;
      void populatePersonaList(list, search.value, countEl);
    }, 120);
  });

  const sort = el("select", "pme-persona-sort");
  sort.title = "Sort";
  sort.innerHTML = `
    <option value="name_asc">A-Z</option>
    <option value="name_desc">Z-A</option>
    <option value="id_asc">ID ↑</option>
    <option value="id_desc">ID ↓</option>
  `;
  sort.value = getPersonaSortMode();
  sort.addEventListener("change", () => {
    setPersonaSortMode(/** @type {any} */ (sort.value));
    void populatePersonaList(list, search.value, countEl);
  });

  controls.appendChild(search);
  controls.appendChild(sort);
  block.appendChild(controls);

  const list = el("div", "pme-persona-list");
  list.textContent = "Loading personas…";
  block.appendChild(list);

  personaListState = { listEl: list, searchEl: search, countEl };

  list.addEventListener("click", async (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target : null;
    const row = target?.closest?.("[data-persona-id]");
    if (!(row instanceof HTMLElement)) return;

    const id = row.dataset.personaId;
    if (!id) return;
    if (id === user_avatar) return;

    // Visual feedback immediately
    list
      .querySelectorAll(".pme-persona")
      .forEach((n) => n.classList.remove("is_active"));
    row.classList.add("is_active");

    try {
      await setUserAvatar(id, {
        toastPersonaNameChange: false,
        navigateToCurrent: false,
      });
    } finally {
      schedulePersonaListRefresh({ autoScroll: true });
      refreshAdvancedUIIfVisible();
    }
  });

  void populatePersonaList(list, "", countEl, { autoScroll: true });
  return block;
}

async function populatePersonaList(
  listEl,
  query,
  countEl,
  { autoScroll = false } = {}
) {
  const q = String(query ?? "")
    .trim()
    .toLowerCase();
  const personas = await loadPersonas();

  const filtered = q
    ? personas.filter((id) => {
        const name = getPersonaName(id).toLowerCase();
        const desc = getPersonaDescriptionPreview(id).toLowerCase();
        return (
          name.includes(q) || desc.includes(q) || id.toLowerCase().includes(q)
        );
      })
    : personas;

  const sortMode = getPersonaSortMode();
  const sorted = [...filtered].sort((a, b) => {
    switch (sortMode) {
      case "name_asc":
        return getPersonaName(a).localeCompare(getPersonaName(b));
      case "name_desc":
        return getPersonaName(b).localeCompare(getPersonaName(a));
      case "id_asc":
        return String(a).localeCompare(String(b));
      case "id_desc":
        return String(b).localeCompare(String(a));
      default:
        return 0;
    }
  });

  listEl.innerHTML = "";

  if (!sorted.length) {
    if (countEl) countEl.textContent = "(0)";
    listEl.appendChild(el("div", "text_muted", "No personas found."));
    return;
  }

  if (countEl) countEl.textContent = `(${sorted.length})`;

  for (const id of sorted) {
    const row = el("div", "pme-persona");
    row.dataset.personaId = id;
    if (id === user_avatar) row.classList.add("is_active");

    const img = document.createElement("img");
    img.className = "pme-persona-avatar";
    img.alt = "";
    img.loading = "lazy";
    img.src = getThumbnailUrl("persona", id);

    const meta = el("div", "pme-persona-meta");

    const nameRow = el("div", "pme-persona-name-row");
    nameRow.appendChild(
      el("div", "pme-persona-name", getPersonaName(id) || "[Unnamed Persona]")
    );

    const title = getPersonaTitle(id);
    if (title) {
      nameRow.appendChild(el("div", "pme-persona-title", title));
    } else {
      // Keep alignment consistent even without title
      nameRow.appendChild(el("div", "pme-persona-title", ""));
    }

    meta.appendChild(nameRow);
    const preview = getPersonaDescriptionPreview(id);
    if (preview) meta.appendChild(el("div", "pme-persona-desc", preview));

    row.appendChild(img);
    row.appendChild(meta);
    listEl.appendChild(row);
  }

  if (autoScroll) {
    const active = listEl.querySelector(".pme-persona.is_active");
    if (active instanceof HTMLElement) {
      active.scrollIntoView({ block: "nearest" });
    }
  }
}

function renderAdditionalDescriptionsBlock() {
  const block = el("div", "pme-card pme-additional");

  const header = el("div", "pme-card-title-row");
  header.appendChild(el("div", "pme-card-title", "Additional Descriptions"));

  const actions = el("div", "pme-actions");
  const addBtn = el("button", "menu_button menu_button_icon pme-add-btn");
  addBtn.type = "button";
  addBtn.title = "Add";
  addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
  addBtn.addEventListener("click", () => {
    addItem();
    refreshAdvancedUIIfVisible();
  });
  actions.appendChild(addBtn);
  header.appendChild(actions);
  block.appendChild(header);

  const list = el("div", "pme-add-list");
  const items = listItems();

  if (!items.length) {
    const empty = el(
      "div",
      "text_muted",
      "No additional descriptions yet. Click + to add one."
    );
    list.appendChild(empty);
  } else {
    for (const item of items) {
      list.appendChild(renderAdditionalItem(item));
    }
  }

  block.appendChild(list);
  return block;
}

function renderAdditionalItem(item) {
  const row = el("div", "pme-item");
  row.dataset.pmeItemId = item.id;

  const top = el("div", "pme-item-top");

  const titleInput = el("input", "text_pole pme-item-title");
  titleInput.type = "text";
  titleInput.value = item.title ?? "";
  titleInput.placeholder = "Title";
  titleInput.addEventListener("input", () =>
    patchItem(item.id, { title: titleInput.value })
  );
  top.appendChild(titleInput);

  const enabledLabel = el("label", "checkbox_label pme-item-enabled");
  const enabled = el("input");
  enabled.type = "checkbox";
  enabled.checked = !!item.enabled;
  enabled.addEventListener("input", () =>
    patchItem(item.id, { enabled: enabled.checked })
  );
  enabledLabel.appendChild(enabled);
  enabledLabel.appendChild(el("span", "", "Enabled"));
  top.appendChild(enabledLabel);

  const deleteBtn = el(
    "button",
    "menu_button menu_button_icon pme-item-delete"
  );
  deleteBtn.type = "button";
  deleteBtn.title = "Delete";
  deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
  deleteBtn.addEventListener("click", () => {
    removeItem(item.id);
    refreshAdvancedUIIfVisible();
  });
  top.appendChild(deleteBtn);

  const collapseBtn = el(
    "button",
    "menu_button menu_button_icon pme-item-collapse"
  );
  collapseBtn.type = "button";
  collapseBtn.title = item.collapsed ? "Expand" : "Collapse";
  collapseBtn.innerHTML = item.collapsed
    ? '<i class="fa-solid fa-chevron-down"></i>'
    : '<i class="fa-solid fa-chevron-up"></i>';
  collapseBtn.addEventListener("click", () => {
    patchItem(item.id, { collapsed: !item.collapsed });
    refreshAdvancedUIIfVisible();
  });
  top.appendChild(collapseBtn);

  row.appendChild(top);

  const body = el("div", "pme-item-body");
  body.classList.toggle("displayNone", !!item.collapsed);

  const textarea = el("textarea", "text_pole pme-item-text");
  textarea.rows = 4;
  textarea.value = item.text ?? "";
  textarea.placeholder = "Text to inject when enabled...";
  textarea.addEventListener("input", () =>
    patchItem(item.id, { text: textarea.value })
  );
  body.appendChild(textarea);

  row.appendChild(body);

  row.classList.toggle("pme-item-disabled", !item.enabled);
  return row;
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
    autoScrollToActiveNext = true;
    renderAdvancedUI(root);
    // If list is already mounted, auto-scroll once
    if (personaListState) {
      schedulePersonaListRefresh({ autoScroll: true });
    }
  } else {
    // When going back to Normal mode, sync native UI from power_user
    try {
      syncNativePersonaControls();
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

  ensureAdvancedToggle();
  getOrCreateAdvancedRoot(container);

  // Observe native persona list updates and mirror them
  if (!nativePersonaListObserver) {
    const nativeList = document.getElementById("user_avatar_block");
    if (nativeList) {
      nativePersonaListObserver = new MutationObserver(() => {
        if (!getAdvancedModeEnabled()) return;
        schedulePersonaListRefresh();
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
    renderAdvancedUI(root);
  } catch (e) {
    warn("Failed to refresh advanced UI", e);
  }
}
