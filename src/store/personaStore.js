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
 * @property {{advancedOpen?: boolean, connections?: {enabled?: boolean, chats?: string[], characters?: string[]}, match?: {enabled?: boolean, query?: string}}} [adv]
 */

/**
 * @typedef {object} PmeGroup
 * @property {string} id
 * @property {string} title
 * @property {boolean} enabled
 * @property {boolean} collapsed
 * @property {PmeItem[]} items
 * @property {{advancedOpen?: boolean, connections?: {enabled?: boolean, chats?: string[], characters?: string[]}, match?: {enabled?: boolean, query?: string}}} [adv]
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
 * @property {{wrapperEnabled:boolean, wrapperTemplate:string, additionalJoiner:string}} settings
 */

// Clean start: no migrations (dev stage)
const SCHEMA_VERSION = 1;

const DEFAULT_SETTINGS = Object.freeze({
  wrapperEnabled: false,
  wrapperTemplate: "<tag>{{PROMPT}}</tag>",
  additionalJoiner: "\\n\\n",
});

const DEFAULT_ADV = Object.freeze({
  advancedOpen: false,
  connections: { enabled: false, chats: [], characters: [] },
  match: { enabled: false, query: "" },
});

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

function makeDefaultAdv() {
  // Avoid relying on structuredClone availability.
  return {
    advancedOpen: false,
    connections: { enabled: false, chats: [], characters: [] },
    match: { enabled: false, query: "" },
  };
}

/**
 * @param {any} target
 */
function normalizeAdv(target) {
  if (!target || typeof target !== "object") return;
  target.adv ??= {};
  if (typeof target.adv !== "object") target.adv = {};

  if (typeof target.adv.advancedOpen !== "boolean")
    target.adv.advancedOpen = DEFAULT_ADV.advancedOpen;

  target.adv.connections ??= {};
  if (typeof target.adv.connections !== "object") target.adv.connections = {};
  if (typeof target.adv.connections.enabled !== "boolean")
    target.adv.connections.enabled = DEFAULT_ADV.connections.enabled;
  if (!Array.isArray(target.adv.connections.chats))
    target.adv.connections.chats = [];
  if (!Array.isArray(target.adv.connections.characters))
    target.adv.connections.characters = [];
  target.adv.connections.chats = target.adv.connections.chats
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  target.adv.connections.characters = target.adv.connections.characters
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);

  target.adv.match ??= {};
  if (typeof target.adv.match !== "object") target.adv.match = {};
  if (typeof target.adv.match.enabled !== "boolean")
    target.adv.match.enabled = DEFAULT_ADV.match.enabled;
  if (typeof target.adv.match.query !== "string")
    target.adv.match.query = DEFAULT_ADV.match.query;
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
  descriptor.pme.settings ??= {};
  if (typeof descriptor.pme.settings !== "object") descriptor.pme.settings = {};
  if (typeof descriptor.pme.settings.wrapperEnabled !== "boolean")
    descriptor.pme.settings.wrapperEnabled = DEFAULT_SETTINGS.wrapperEnabled;
  if (typeof descriptor.pme.settings.wrapperTemplate !== "string")
    descriptor.pme.settings.wrapperTemplate = DEFAULT_SETTINGS.wrapperTemplate;
  if (typeof descriptor.pme.settings.additionalJoiner !== "string")
    descriptor.pme.settings.additionalJoiner =
      DEFAULT_SETTINGS.additionalJoiner;

  // Normalize blocks (defensive)
  for (const b of descriptor.pme.blocks) {
    if (b?.type === "item") {
      b.id = String(b.id ?? "").trim() || makeId();
      b.title = String(b.title ?? "").trim() || "Item";
      b.text = String(b.text ?? "");
      b.enabled = b.enabled ?? true;
      b.collapsed = b.collapsed ?? false;
      normalizeAdv(b);
    } else if (b?.type === "group") {
      b.id = String(b.id ?? "").trim() || makeId();
      b.title = String(b.title ?? "").trim() || "Group";
      b.enabled = b.enabled ?? true;
      b.collapsed = b.collapsed ?? false;
      b.items ??= [];
      normalizeAdv(b);
      for (const it of b.items) {
        it.id = String(it.id ?? "").trim() || makeId();
        it.title = String(it.title ?? "").trim() || "Item";
        it.text = String(it.text ?? "");
        it.enabled = it.enabled ?? true;
        it.collapsed = it.collapsed ?? false;
        normalizeAdv(it);
      }
    }
  }

  return /** @type {PmeData} */ (descriptor.pme);
}

export function savePmeData() {
  scheduleSave();
}

/**
 * Persona-scoped PME UI/prompt settings.
 * Stored at `power_user.persona_descriptions[avatarId].pme.settings`.
 */
export function getPmeSettings() {
  return getPmeData().settings;
}

/**
 * @param {Partial<{wrapperEnabled:boolean, wrapperTemplate:string, additionalJoiner:string}>} patch
 */
export function patchPmeSettings(patch) {
  Object.assign(getPmeSettings(), patch);
  savePmeData();
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
    adv: makeDefaultAdv(),
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
    adv: makeDefaultAdv(),
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
    adv: makeDefaultAdv(),
  };
  group.items.push(item);
  savePmeData();
  return item;
}

/**
 * Move a top-level block (item or group) by delta (-1 up, +1 down).
 * @param {string} id
 * @param {number} delta
 */
export function moveBlock(id, delta) {
  const data = getPmeData();
  const idx = data.blocks.findIndex((b) => String(b?.id) === String(id));
  if (idx === -1) return;
  const next = idx + (delta < 0 ? -1 : 1);
  if (next < 0 || next >= data.blocks.length) return;
  const tmp = data.blocks[idx];
  data.blocks[idx] = data.blocks[next];
  data.blocks[next] = tmp;
  savePmeData();
}

/**
 * Move an item within a group by delta (-1 up, +1 down).
 * @param {string} groupId
 * @param {string} itemId
 * @param {number} delta
 */
export function moveItemInGroup(groupId, itemId, delta) {
  const data = getPmeData();
  const group = data.blocks.find((b) => b.type === "group" && b.id === groupId);
  if (!group || group.type !== "group") return;
  group.items ??= [];
  const idx = group.items.findIndex((it) => String(it?.id) === String(itemId));
  if (idx === -1) return;
  const next = idx + (delta < 0 ? -1 : 1);
  if (next < 0 || next >= group.items.length) return;
  const tmp = group.items[idx];
  group.items[idx] = group.items[next];
  group.items[next] = tmp;
  savePmeData();
}

/**
 * Convenience for UI
 */
export function getCurrentPersonaMeta() {
  return { avatarId: user_avatar };
}
