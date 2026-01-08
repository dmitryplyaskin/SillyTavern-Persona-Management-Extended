import {
  getUserAvatars,
  setUserAvatar,
  user_avatar,
} from "/scripts/personas.js";
import { getThumbnailUrl } from "/script.js";

import { getPersonaSortMode, setPersonaSortMode } from "../../core/mode.js";
import { el } from "./dom.js";
import { UI_EVENTS } from "../uiBus.js";

/**
 * @param {string} avatarId
 * @param {any} power_user
 */
function getPersonaName(power_user, avatarId) {
  return power_user?.personas?.[avatarId] ?? avatarId ?? "";
}

/**
 * @param {string} avatarId
 * @param {any} power_user
 */
function getPersonaTitle(power_user, avatarId) {
  const raw = power_user?.persona_descriptions?.[avatarId]?.title ?? "";
  return String(raw ?? "").trim();
}

/**
 * Returns persona descriptor for an avatar id (raw object stored by ST).
 * @param {any} power_user
 * @param {string} avatarId
 */
function getPersonaDescriptor(power_user, avatarId) {
  return power_user?.persona_descriptions?.[avatarId];
}

/**
 * Default is linked (legacy behavior). Only explicit `false` means unlinked.
 * @param {any} descObj
 */
function isLinkedToNative(descObj) {
  return descObj?.pme?.linkedToNative !== false;
}

/**
 * @param {any} power_user
 * @param {string} avatarId
 */
function getEffectiveDescription(power_user, avatarId) {
  const descObj = getPersonaDescriptor(power_user, avatarId);
  if (!isLinkedToNative(descObj)) {
    return String(descObj?.pme?.local?.description ?? "");
  }
  return String(descObj?.description ?? "");
}

/**
 * @param {string} avatarId
 * @param {any} power_user
 */
function getPersonaDescriptionPreview(power_user, avatarId) {
  const text = getEffectiveDescription(power_user, avatarId)
    .trim()
    .replaceAll("\n", " ");
  if (!text) return "";
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

/**
 * @param {any} power_user
 * @param {string} avatarId
 */
function getDescriptionLength(power_user, avatarId) {
  return getEffectiveDescription(power_user, avatarId).trim().length;
}

/**
 * @param {any} power_user
 * @param {string} avatarId
 */
function getConnectionsCount(power_user, avatarId) {
  const conns = power_user?.persona_descriptions?.[avatarId]?.connections;
  return Array.isArray(conns) ? conns.length : 0;
}

/**
 * @param {any} power_user
 * @param {string} avatarId
 */
function hasLorebook(power_user, avatarId) {
  const raw = power_user?.persona_descriptions?.[avatarId]?.lorebook ?? "";
  return !!String(raw ?? "").trim();
}

export function createPersonaList({ getPowerUser, bus }) {
  /** @type {string[]|null} */
  let personasCache = null;
  /** @type {Promise<string[]>|null} */
  let personasLoadPromise = null;

  let query = "";
  let scrollTop = 0;
  let refreshTimer = /** @type {number|undefined} */ (undefined);
  let autoScrollNext = false;

  const root = el("div", "pme-card pme-personas");

  const header = el("div", "pme-card-title-row");
  const titleWrap = el("div", "pme-card-title");
  titleWrap.textContent = "Personas ";
  const countEl = el("span", "pme-count", "(0)");
  titleWrap.appendChild(countEl);
  header.appendChild(titleWrap);

  const actions = el("div", "pme-actions");
  const refreshBtn = el("button", "menu_button menu_button_icon pme-icon-btn");
  refreshBtn.type = "button";
  refreshBtn.title = "Refresh list";
  refreshBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
  actions.appendChild(refreshBtn);
  header.appendChild(actions);
  root.appendChild(header);

  const controls = el("div", "pme-persona-controls");
  const search = el("input", "text_pole pme-persona-search");
  search.type = "search";
  search.placeholder = "Search...";

  const sort = el("select", "pme-persona-sort");
  sort.title = "Sort";
  sort.innerHTML = `
    <option value="name_asc">A-Z</option>
    <option value="name_desc">Z-A</option>
    <option value="id_asc">ID ↑</option>
    <option value="id_desc">ID ↓</option>
    <option value="desc_len_asc">Description length ↑</option>
    <option value="desc_len_desc">Description length ↓</option>
    <option value="connections_asc">Connections ↑</option>
    <option value="connections_desc">Connections ↓</option>
    <option value="lorebook_first">Lorebook first</option>
    <option value="lorebook_last">Lorebook last</option>
  `;
  controls.appendChild(search);
  controls.appendChild(sort);
  root.appendChild(controls);

  const listEl = el("div", "pme-persona-list");
  listEl.textContent = "Loading personas…";
  root.appendChild(listEl);

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

  async function renderList({ autoScroll = false } = {}) {
    const preserveScroll = scrollTop;
    const power = getPowerUser();
    const personas = await loadPersonas();
    const q = String(query ?? "")
      .trim()
      .toLowerCase();

    const filtered = q
      ? personas.filter((id) => {
          const name = getPersonaName(power, id).toLowerCase();
          const desc = getPersonaDescriptionPreview(power, id).toLowerCase();
          return (
            name.includes(q) ||
            desc.includes(q) ||
            String(id).toLowerCase().includes(q)
          );
        })
      : personas;

    const sortMode = getPersonaSortMode();
    const sorted = [...filtered].sort((a, b) => {
      switch (sortMode) {
        case "name_asc":
          return getPersonaName(power, a).localeCompare(
            getPersonaName(power, b)
          );
        case "name_desc":
          return getPersonaName(power, b).localeCompare(
            getPersonaName(power, a)
          );
        case "id_asc":
          return String(a).localeCompare(String(b));
        case "id_desc":
          return String(b).localeCompare(String(a));
        case "desc_len_asc": {
          const d =
            getDescriptionLength(power, a) - getDescriptionLength(power, b);
          if (d !== 0) return d;
          return getPersonaName(power, a).localeCompare(
            getPersonaName(power, b)
          );
        }
        case "desc_len_desc": {
          const d =
            getDescriptionLength(power, b) - getDescriptionLength(power, a);
          if (d !== 0) return d;
          return getPersonaName(power, a).localeCompare(
            getPersonaName(power, b)
          );
        }
        case "connections_asc": {
          const d =
            getConnectionsCount(power, a) - getConnectionsCount(power, b);
          if (d !== 0) return d;
          return getPersonaName(power, a).localeCompare(
            getPersonaName(power, b)
          );
        }
        case "connections_desc": {
          const d =
            getConnectionsCount(power, b) - getConnectionsCount(power, a);
          if (d !== 0) return d;
          return getPersonaName(power, a).localeCompare(
            getPersonaName(power, b)
          );
        }
        case "lorebook_first": {
          const d =
            Number(hasLorebook(power, b)) - Number(hasLorebook(power, a));
          if (d !== 0) return d;
          return getPersonaName(power, a).localeCompare(
            getPersonaName(power, b)
          );
        }
        case "lorebook_last": {
          const d =
            Number(hasLorebook(power, a)) - Number(hasLorebook(power, b));
          if (d !== 0) return d;
          return getPersonaName(power, a).localeCompare(
            getPersonaName(power, b)
          );
        }
        default:
          return 0;
      }
    });

    listEl.innerHTML = "";
    if (!sorted.length) {
      countEl.textContent = "(0)";
      listEl.appendChild(el("div", "text_muted", "No personas found."));
      return;
    }

    countEl.textContent = `(${sorted.length})`;
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
        el(
          "div",
          "pme-persona-name",
          getPersonaName(power, id) || "[Unnamed Persona]"
        )
      );
      const rightMeta = el("div", "pme-persona-badges");
      const title = getPersonaTitle(power, id);
      rightMeta.appendChild(el("div", "pme-persona-title", title || ""));
      if (hasLorebook(power, id)) {
        rightMeta.appendChild(el("div", "pme-persona-lorebook", "Lorebook"));
      }
      nameRow.appendChild(rightMeta);
      meta.appendChild(nameRow);

      const preview = getPersonaDescriptionPreview(power, id);
      if (preview) meta.appendChild(el("div", "pme-persona-desc", preview));

      row.appendChild(img);
      row.appendChild(meta);
      listEl.appendChild(row);
    }

    if (autoScroll) {
      const active = listEl.querySelector(".pme-persona.is_active");
      if (active instanceof HTMLElement)
        active.scrollIntoView({ block: "nearest" });
      scrollTop = listEl.scrollTop;
    } else {
      listEl.scrollTop = preserveScroll;
      scrollTop = preserveScroll;
    }
  }

  function scheduleRefresh({
    invalidateCache = true,
    autoScroll = false,
  } = {}) {
    autoScrollNext ||= autoScroll;
    if (invalidateCache) personasCache = null;
    if (refreshTimer) window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshTimer = undefined;
      void renderList({ autoScroll: autoScrollNext });
      autoScrollNext = false;
    }, 150);
  }

  function setActiveVisual(id) {
    listEl
      .querySelectorAll(".pme-persona")
      .forEach((n) => n.classList.remove("is_active"));
    const row = listEl.querySelector(`[data-persona-id="${CSS.escape(id)}"]`);
    if (row instanceof HTMLElement) row.classList.add("is_active");
  }

  // Events
  listEl.addEventListener("scroll", () => {
    scrollTop = listEl.scrollTop;
  });

  refreshBtn.addEventListener("click", async () => {
    personasCache = null;
    await renderList();
  });

  let searchTimer = /** @type {number|undefined} */ (undefined);
  search.addEventListener("input", () => {
    query = String(search.value ?? "");
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      searchTimer = undefined;
      void renderList();
    }, 120);
  });

  sort.addEventListener("change", () => {
    setPersonaSortMode(/** @type {any} */ (sort.value));
    void renderList();
  });

  listEl.addEventListener("click", async (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target : null;
    const row = target?.closest?.("[data-persona-id]");
    if (!(row instanceof HTMLElement)) return;
    const id = row.dataset.personaId;
    if (!id) return;
    if (id === user_avatar) return;

    setActiveVisual(id);
    try {
      await setUserAvatar(id, {
        toastPersonaNameChange: false,
        navigateToCurrent: false,
      });
    } finally {
      scheduleRefresh({ invalidateCache: false, autoScroll: false });
      bus?.emit?.(UI_EVENTS.PERSONA_CHANGED, { avatarId: id });
    }
  });

  return {
    el: root,
    mount({ autoScroll = false } = {}) {
      search.value = query;
      sort.value = getPersonaSortMode();
      autoScrollNext = autoScroll;
      void renderList({ autoScroll });
    },
    update({ invalidateCache = false, autoScroll = false } = {}) {
      scheduleRefresh({ invalidateCache, autoScroll });
    },
    updatePreviewOnly() {
      // No cache invalidation; just redraw from current power_user data.
      scheduleRefresh({ invalidateCache: false, autoScroll: false });
    },
  };
}
