import { saveSettingsDebounced } from "/script.js";
import {
  getOrCreatePersonaDescriptor,
  user_avatar,
} from "/scripts/personas.js";

/**
 * @typedef {object} PmeItem
 * @property {string} id
 * @property {string} title
 * @property {string} text
 * @property {boolean} enabled
 * @property {boolean} collapsed
 */

/**
 * @typedef {object} PmeGroup
 * @property {string} id
 * @property {string} title
 * @property {boolean} enabled
 * @property {boolean} collapsed
 * @property {PmeItem[]} items
 */

/**
 * @typedef {(
 *   | ({type: "item"} & PmeItem)
 *   | ({type: "group"} & PmeGroup)
 * )} PmeBlock
 */

/**
 * @typedef {object} PmeData
 * @property {number} version
 * @property {PmeBlock[]} blocks
 */

// Clean start: no migrations (dev stage)
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
    descriptor.pme = { version: SCHEMA_VERSION, blocks: [] };
  }

  descriptor.pme.version = SCHEMA_VERSION;
  descriptor.pme.blocks ??= [];

  // Normalize blocks (defensive)
  for (const b of descriptor.pme.blocks) {
    if (b?.type === "item") {
      b.id = String(b.id ?? "").trim() || makeId();
      b.title = String(b.title ?? "").trim() || "Item";
      b.text = String(b.text ?? "");
      b.enabled = b.enabled ?? true;
      b.collapsed = b.collapsed ?? false;
    } else if (b?.type === "group") {
      b.id = String(b.id ?? "").trim() || makeId();
      b.title = String(b.title ?? "").trim() || "Group";
      b.enabled = b.enabled ?? true;
      b.collapsed = b.collapsed ?? false;
      b.items ??= [];
      for (const it of b.items) {
        it.id = String(it.id ?? "").trim() || makeId();
        it.title = String(it.title ?? "").trim() || "Item";
        it.text = String(it.text ?? "");
        it.enabled = it.enabled ?? true;
        it.collapsed = it.collapsed ?? false;
      }
    }
  }

  return /** @type {PmeData} */ (descriptor.pme);
}

export function savePmeData() {
  scheduleSave();
}

/**
 * Blocks are ordered and MUST NOT be auto-sorted.
 * @returns {PmeBlock[]}
 */
export function listBlocks() {
  return getPmeData().blocks;
}

/**
 * @returns {PmeBlock}
 */
export function addItem() {
  const data = getPmeData();
  const block = {
    type: "item",
    id: makeId(),
    title: `Item ${data.blocks.filter((b) => b.type === "item").length + 1}`,
    text: "",
    enabled: true,
    collapsed: false,
  };
  data.blocks.push(block);
  savePmeData();
  return block;
}

/**
 * @param {string} [title]
 * @returns {PmeBlock}
 */
export function addGroup(title = "") {
  const data = getPmeData();
  const block = {
    type: "group",
    id: makeId(),
    title:
      String(title ?? "").trim() ||
      `Group ${data.blocks.filter((b) => b.type === "group").length + 1}`,
    enabled: true,
    collapsed: false,
    items: [],
  };
  data.blocks.push(block);
  savePmeData();
  return block;
}

/**
 * @param {string} id
 * @param {Partial<PmeGroup>} patch
 */
export function patchGroup(id, patch) {
  const data = getPmeData();
  const idx = data.blocks.findIndex((b) => b.type === "group" && b.id === id);
  if (idx === -1) return;
  data.blocks[idx] = { ...data.blocks[idx], ...patch, type: "group" };
  data.blocks[idx].items ??= [];
  savePmeData();
}

/**
 * @param {string} id
 */
export function removeGroup(id) {
  const data = getPmeData();
  data.blocks = data.blocks.filter((b) => !(b.type === "group" && b.id === id));
  savePmeData();
}

/**
 * @param {string} id
 * @param {Partial<PmeItem>} patch
 */
export function patchItem(id, patch) {
  const data = getPmeData();
  for (const b of data.blocks) {
    if (b.type === "item" && b.id === id) {
      Object.assign(b, patch);
      savePmeData();
      return;
    }
    if (b.type === "group") {
      const idx = b.items.findIndex((x) => x.id === id);
      if (idx === -1) continue;
      b.items[idx] = { ...b.items[idx], ...patch };
      savePmeData();
      return;
    }
  }
  savePmeData();
}

/**
 * @param {string} id
 */
export function removeItem(id) {
  const data = getPmeData();
  data.blocks = data.blocks.filter((b) => !(b.type === "item" && b.id === id));
  for (const b of data.blocks) {
    if (b.type !== "group") continue;
    b.items = (b.items ?? []).filter((x) => x.id !== id);
  }
  savePmeData();
}

/**
 * @param {string} groupId
 * @returns {PmeItem|null}
 */
export function addItemToGroup(groupId) {
  const data = getPmeData();
  const group = data.blocks.find((b) => b.type === "group" && b.id === groupId);
  if (!group || group.type !== "group") return null;
  group.items ??= [];
  const item = {
    id: makeId(),
    title: `Item ${group.items.length + 1}`,
    text: "",
    enabled: true,
    collapsed: false,
  };
  group.items.push(item);
  savePmeData();
  return item;
}

/**
 * Convenience for UI
 */
export function getCurrentPersonaMeta() {
  return { avatarId: user_avatar };
}
