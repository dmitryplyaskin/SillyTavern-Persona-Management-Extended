import { el, setHidden } from "./dom.js";

/**
 * Native Persona Management blocks we temporarily relocate into our Advanced UI.
 * We move real nodes (not clones) to preserve all ST event handlers.
 *
 * @typedef {{parent: Node, nextSibling: ChildNode|null}} Origin
 * @typedef {{nodes: HTMLElement[], origins: Map<HTMLElement, Origin>}} RelocatedState
 */

/** @type {RelocatedState|null} */
let relocatedNative = null;

function ensureRelocatedNativeState() {
  if (relocatedNative) return relocatedNative;
  relocatedNative = { nodes: [], origins: new Map() };
  return relocatedNative;
}

function collectNativeRelocatableNodes() {
  /** @type {HTMLElement[]} */
  const nodes = [];

  const buttons = document.getElementById("persona_connections_buttons");
  const info = document.getElementById("persona_connections_info_block");
  const list = document.getElementById("persona_connections_list");

  // "Connections" header is the previous element sibling of the buttons block in the native UI
  const header = buttons?.previousElementSibling;
  if (header instanceof HTMLElement && header.tagName === "H4") nodes.push(header);
  if (buttons instanceof HTMLElement) nodes.push(buttons);
  if (info instanceof HTMLElement) nodes.push(info);
  if (list instanceof HTMLElement) nodes.push(list);

  const global = document.querySelector(".persona_management_global_settings");
  if (global instanceof HTMLElement) nodes.push(global);

  return nodes;
}

function relocateNativeBlocks(target) {
  const state = ensureRelocatedNativeState();

  // Refresh node list each time in case ST rebuilt parts of the UI
  const found = collectNativeRelocatableNodes();
  // If nodes were detached by a previous full re-render, document queries won't find them.
  // In that case, fall back to the last known node refs.
  const nodes = found.length ? found : state.nodes;
  if (found.length) state.nodes = found;

  for (const node of nodes) {
    if (!state.origins.has(node)) {
      const parent = node.parentNode;
      if (parent) state.origins.set(node, { parent, nextSibling: node.nextSibling });
    }
    if (node.parentNode !== target) target.appendChild(node);
  }
}

export function restoreNativePersonaLinksBlocks() {
  if (!relocatedNative) return;
  for (const [node, origin] of relocatedNative.origins.entries()) {
    if (node.parentNode === origin.parent) continue;
    try {
      origin.parent.insertBefore(node, origin.nextSibling);
    } catch {
      try {
        origin.parent.appendChild(node);
      } catch {
        // ignore
      }
    }
  }
}

export function createPersonaLinksGlobalSettingsCard() {
  let collapsed = true;

  const root = el("div", "pme-card pme-links");
  const header = el("div", "pme-card-title-row");
  const title = el("div", "pme-card-title", "Connections & Global Settings");
  header.appendChild(title);

  const actions = el("div", "pme-actions");
  const collapseBtn = el("button", "menu_button menu_button_icon");
  collapseBtn.type = "button";
  actions.appendChild(collapseBtn);
  header.appendChild(actions);
  root.appendChild(header);

  const body = el("div", "pme-links-body");
  root.appendChild(body);

  function syncCollapsedUI() {
    collapseBtn.title = collapsed ? "Expand" : "Collapse";
    collapseBtn.innerHTML = collapsed
      ? '<i class="fa-solid fa-chevron-down"></i>'
      : '<i class="fa-solid fa-chevron-up"></i>';
    setHidden(body, collapsed);
  }

  collapseBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    collapsed = !collapsed;
    syncCollapsedUI();
    if (!collapsed) {
      // Ensure native controls are visible and attached when expanding
      relocateNativeBlocks(body);
    }
  });

  return {
    el: root,
    mount() {
      // Always relocate once; hidden state controls visibility
      relocateNativeBlocks(body);
      syncCollapsedUI();
    },
    update() {
      // If ST re-rendered its internal bits, re-attach them into our body (no-op otherwise)
      relocateNativeBlocks(body);
      syncCollapsedUI();
    },
    destroy() {
      restoreNativePersonaLinksBlocks();
    },
  };
}

