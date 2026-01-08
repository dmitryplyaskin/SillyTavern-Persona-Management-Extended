import { saveSettingsDebounced } from "/script.js";
import { getOrCreatePersonaDescriptor, user_avatar } from "/scripts/personas.js";

/**
 * @typedef {object} PmeItem
 * @property {string} id
 * @property {string} title
 * @property {string} text
 * @property {boolean} enabled
 * @property {boolean} collapsed
 */

/**
 * @typedef {object} PmeData
 * @property {number} version
 * @property {PmeItem[]} items
 */

const SCHEMA_VERSION = 1;

let saveTimer = /** @type {number|undefined} */ (undefined);

function scheduleSave() {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    saveSettingsDebounced();
  }, 200);
}

function makeId() {
  // Keep it short & portable (no crypto requirement)
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Returns (and initializes) PME storage for current persona.
 * @returns {PmeData}
 */
export function getPmeData() {
  // Ensure base persona descriptor exists
  const descriptor = getOrCreatePersonaDescriptor();
  if (!descriptor.pme || typeof descriptor.pme !== "object") {
    descriptor.pme = { version: SCHEMA_VERSION, items: [] };
  }

  // Migration hook (future)
  if (descriptor.pme.version !== SCHEMA_VERSION) {
    descriptor.pme.version = SCHEMA_VERSION;
    descriptor.pme.items ??= [];
  }

  descriptor.pme.items ??= [];
  return /** @type {PmeData} */ (descriptor.pme);
}

export function savePmeData() {
  scheduleSave();
}

/**
 * @returns {PmeItem[]}
 */
export function listItems() {
  return getPmeData().items;
}

/**
 * @returns {PmeItem}
 */
export function addItem() {
  const data = getPmeData();
  const item = {
    id: makeId(),
    title: `Item ${data.items.length + 1}`,
    text: "",
    enabled: true,
    collapsed: false,
  };
  data.items.push(item);
  savePmeData();
  return item;
}

/**
 * @param {string} id
 * @param {Partial<PmeItem>} patch
 */
export function patchItem(id, patch) {
  const data = getPmeData();
  const idx = data.items.findIndex((x) => x.id === id);
  if (idx === -1) return;
  data.items[idx] = { ...data.items[idx], ...patch };
  savePmeData();
}

/**
 * @param {string} id
 */
export function removeItem(id) {
  const data = getPmeData();
  data.items = data.items.filter((x) => x.id !== id);
  savePmeData();
}

/**
 * Convenience for UI
 */
export function getCurrentPersonaMeta() {
  return { avatarId: user_avatar };
}

