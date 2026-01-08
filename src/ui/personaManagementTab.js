import { power_user } from "/scripts/power-user.js";
import {
  getUserAvatars,
  setUserAvatar,
  user_avatar,
} from "/scripts/personas.js";
import { getThumbnailUrl } from "/script.js";

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

  const { avatarId } = getCurrentPersonaMeta();
  const personaName = getPersonaName(avatarId);

  const layout = el("div", "pme-layout");
  const left = el("div", "pme-left");
  const right = el("div", "pme-right");

  left.appendChild(renderPersonaListBlock());

  const personaCard = el("div", "pme-card pme-card-compact");
  personaCard.appendChild(el("div", "pme-card-title", "Current persona"));
  const personaBody = el("div", "pme-card-body");
  personaBody.appendChild(el("div", "", `Name: ${personaName}`));
  personaBody.appendChild(el("div", "", `AvatarId: ${String(avatarId ?? "")}`));
  personaCard.appendChild(personaBody);
  right.appendChild(personaCard);

  right.appendChild(renderAdditionalDescriptionsBlock());

  layout.appendChild(left);
  layout.appendChild(right);
  panel.appendChild(layout);

  root.appendChild(panel);
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
  search.addEventListener("input", () => {
    void populatePersonaList(list, search.value, countEl);
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
      refreshAdvancedUIIfVisible();
    }
  });

  void populatePersonaList(list, "", countEl);
  return block;
}

async function populatePersonaList(listEl, query, countEl) {
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
