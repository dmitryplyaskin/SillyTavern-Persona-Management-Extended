import { el } from "./dom.js";
import {
  addGroup,
  addItem,
  addItemToGroup,
  listBlocks,
  moveBlock,
  moveItemInGroup,
  patchGroup,
  patchItem,
  removeGroup,
  removeItem,
} from "../../store/personaStore.js";
import { callGenericPopup, POPUP_TYPE } from "/scripts/popup.js";
import { getTokenCountAsync } from "/scripts/tokenizers.js";

function isAutoActive(entity) {
  return !!(entity?.adv?.connections?.enabled || entity?.adv?.match?.enabled);
}

function buildNextAdv(entity, patch) {
  const prev = entity?.adv && typeof entity.adv === "object" ? entity.adv : {};
  const prevConnections =
    prev.connections && typeof prev.connections === "object" ? prev.connections : {};
  const prevMatch = prev.match && typeof prev.match === "object" ? prev.match : {};

  return {
    ...prev,
    ...(patch ?? {}),
    connections: {
      ...prevConnections,
      ...(patch?.connections ?? {}),
    },
    match: {
      ...prevMatch,
      ...(patch?.match ?? {}),
    },
  };
}

async function getStContextSafe() {
  try {
    const mod = await import("/scripts/st-context.js");
    if (typeof mod.getContext === "function") {
      return mod.getContext();
    }
  } catch {
    // ignore
  }
  return null;
}

function renderAdvancedControls(entity, { kind, patch, onAnyChange }) {
  const adv = entity?.adv && typeof entity.adv === "object" ? entity.adv : {};
  const connections =
    adv.connections && typeof adv.connections === "object" ? adv.connections : {};
  const match = adv.match && typeof adv.match === "object" ? adv.match : {};

  const wrap = el("div", "pme-adv");

  const toggle = el("button", "menu_button pme-adv-toggle");
  toggle.type = "button";
  const isOpen = !!adv.advancedOpen;
  toggle.innerHTML = isOpen
    ? '<i class="fa-solid fa-chevron-up"></i><span>Advanced</span>'
    : '<i class="fa-solid fa-chevron-down"></i><span>Advanced</span>';
  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    patch({ adv: buildNextAdv(entity, { advancedOpen: !isOpen }) });
    onAnyChange?.();
  });
  wrap.appendChild(toggle);

  const body = el("div", "pme-adv-body");
  body.classList.toggle("displayNone", !isOpen);
  wrap.appendChild(body);

  // --- Connections
  const secConnections = el("div", "pme-adv-section");
  secConnections.appendChild(el("div", "pme-adv-title", "Connections"));

  const connEnableLabel = el(
    "label",
    "checkbox_label pme-adv-checkbox",
    ""
  );
  const connEnabled = el("input");
  connEnabled.type = "checkbox";
  connEnabled.checked = !!connections.enabled;
  connEnabled.addEventListener("input", () => {
    patch({
      adv: buildNextAdv(entity, {
        connections: { enabled: connEnabled.checked },
      }),
    });
    onAnyChange?.(); // toggles AUTO/manual UI
  });
  connEnableLabel.appendChild(connEnabled);
  connEnableLabel.appendChild(el("span", "", "Enable"));
  secConnections.appendChild(connEnableLabel);

  secConnections.appendChild(
    el(
      "div",
      "text_muted pme-adv-help",
      `When enabled, this ${kind} is activated automatically when the current chat or character matches one of the bindings below.`
    )
  );

  const connActions = el("div", "pme-adv-actions");

  const addChatBtn = el("button", "menu_button pme-adv-btn");
  addChatBtn.type = "button";
  addChatBtn.innerHTML =
    '<i class="fa-solid fa-comments"></i><span>Add chat</span>';
  addChatBtn.title = "Add current chat to connections";
  addChatBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const ctx = await getStContextSafe();
    const chatKey =
      ctx?.chatId ??
      ctx?.chat?.id ??
      ctx?.chat?.file_name ??
      ctx?.chat?.fileName ??
      ctx?.chatFileName ??
      null;

    const next = String(
      chatKey ?? window.prompt("Enter chat id to bind:", "") ?? ""
    ).trim();
    if (!next) return;

    const prev = Array.isArray(connections.chats) ? connections.chats : [];
    if (prev.includes(next)) return;
    patch({
      adv: buildNextAdv(entity, {
        connections: { chats: [...prev, next] },
      }),
    });
    onAnyChange?.();
  });
  connActions.appendChild(addChatBtn);

  const addCharBtn = el("button", "menu_button pme-adv-btn");
  addCharBtn.type = "button";
  addCharBtn.innerHTML =
    '<i class="fa-solid fa-user"></i><span>Add character</span>';
  addCharBtn.title = "Add current character to connections";
  addCharBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const ctx = await getStContextSafe();
    const chid = Number(ctx?.characterId);
    const charObj =
      Number.isFinite(chid) && Array.isArray(ctx?.characters)
        ? ctx.characters[chid]
        : null;
    const charKey =
      String(charObj?.avatar ?? "").trim() ||
      String(ctx?.character?.avatar ?? "").trim() ||
      String(ctx?.characterAvatar ?? "").trim() ||
      null;

    const next = String(
      charKey ??
        window.prompt("Enter character avatar to bind:", "") ??
        ""
    ).trim();
    if (!next) return;

    const prev = Array.isArray(connections.characters)
      ? connections.characters
      : [];
    if (prev.includes(next)) return;
    patch({
      adv: buildNextAdv(entity, {
        connections: { characters: [...prev, next] },
      }),
    });
    onAnyChange?.();
  });
  connActions.appendChild(addCharBtn);

  secConnections.appendChild(connActions);

  const connList = el("div", "pme-adv-list");

  const makeChip = ({ label, iconUrl = "", title = "" }, onRemove) => {
    const chip = el("div", "pme-adv-chip");
    if (title) chip.title = title;
    if (iconUrl) {
      const img = el("img", "pme-adv-avatar");
      img.alt = "";
      img.src = iconUrl;
      chip.appendChild(img);
    }
    chip.appendChild(el("span", "pme-adv-chip-text", label));
    const rm = el("button", "menu_button menu_button_icon pme-icon-btn pme-adv-chip-rm");
    rm.type = "button";
    rm.title = "Remove";
    rm.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    rm.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onRemove?.();
      onAnyChange?.();
    });
    chip.appendChild(rm);
    return chip;
  };

  const chats = Array.isArray(connections.chats) ? connections.chats : [];
  const chars = Array.isArray(connections.characters) ? connections.characters : [];

  if (!chats.length && !chars.length) {
    connList.appendChild(el("div", "text_muted pme-adv-help", "No connections yet."));
  } else {
    if (chats.length) {
      connList.appendChild(el("div", "pme-adv-subtitle", "Chats"));
      for (const id of chats) {
        connList.appendChild(
          makeChip(
            { label: id, title: `Chat: ${id}` },
            () => {
            patch({
              adv: buildNextAdv(entity, {
                connections: { chats: chats.filter((x) => x !== id) },
              }),
            });
            }
          )
        );
      }
    }
    if (chars.length) {
      connList.appendChild(el("div", "pme-adv-subtitle", "Characters"));
      for (const id of chars) {
        // Render a placeholder chip and hydrate with name/avatar from ST context when available.
        const chip = makeChip(
          { label: id, title: `Character: ${id}` },
          () => {
            patch({
              adv: buildNextAdv(entity, {
                connections: { characters: chars.filter((x) => x !== id) },
              }),
            });
          }
        );
        chip.dataset.pmeCharAvatar = id;
        connList.appendChild(
          chip
        );
      }
    }
  }

  secConnections.appendChild(connList);

  const chatCount = chats.length;
  const charCount = chars.length;
  secConnections.appendChild(
    el(
      "div",
      "pme-adv-count text_muted",
      `Chats: ${chatCount}, Characters: ${charCount}`
    )
  );

  // Hydrate character chips with name + avatar icon.
  if (chars.length) {
    void getStContextSafe().then((ctx) => {
      const allChars = Array.isArray(ctx?.characters) ? ctx.characters : [];
      for (const chip of Array.from(connList.querySelectorAll("[data-pme-char-avatar]"))) {
        const avatar = String(chip.dataset.pmeCharAvatar ?? "").trim();
        if (!avatar) continue;

        const ch = allChars.find((c) => String(c?.avatar ?? "") === avatar);
        const name = String(ch?.name ?? "").trim();
        if (!name) continue;

        // Add icon if possible
        try {
          const iconUrl =
            avatar && avatar !== "none" && typeof ctx?.getThumbnailUrl === "function"
              ? ctx.getThumbnailUrl("avatar", avatar)
              : "";
          if (iconUrl) {
            const img = chip.querySelector("img.pme-adv-avatar");
            if (!img) {
              const newImg = el("img", "pme-adv-avatar");
              newImg.alt = "";
              newImg.src = iconUrl;
              chip.insertBefore(newImg, chip.firstChild);
            } else {
              img.src = iconUrl;
            }
          }
        } catch {
          // ignore
        }

        const textEl = chip.querySelector(".pme-adv-chip-text");
        if (textEl) textEl.textContent = name;
        chip.title = `Character: ${name}\nAvatar: ${avatar}`;
      }
    });
  }

  body.appendChild(secConnections);

  // --- Match / Trigger
  const secMatch = el("div", "pme-adv-section");
  secMatch.appendChild(el("div", "pme-adv-title", "Match"));

  const matchEnableLabel = el("label", "checkbox_label pme-adv-checkbox", "");
  const matchEnabled = el("input");
  matchEnabled.type = "checkbox";
  matchEnabled.checked = !!match.enabled;
  matchEnabled.addEventListener("input", () => {
    patch({
      adv: buildNextAdv(entity, {
        match: { enabled: matchEnabled.checked },
      }),
    });
    onAnyChange?.(); // toggles AUTO/manual UI
  });
  matchEnableLabel.appendChild(matchEnabled);
  matchEnableLabel.appendChild(el("span", "", "Enable match rule"));
  secMatch.appendChild(matchEnableLabel);

  const matchInput = el("input", "text_pole pme-adv-input");
  matchInput.type = "text";
  matchInput.placeholder = "Text or /regex/flags";
  matchInput.value = typeof match.query === "string" ? match.query : "";
  matchInput.addEventListener("input", () => {
    patch({
      adv: buildNextAdv(entity, {
        match: { query: matchInput.value },
      }),
    });
  });
  secMatch.appendChild(matchInput);

  secMatch.appendChild(
    el(
      "div",
      "text_muted pme-adv-help",
      "If the rule matches the current character description, this item is activated automatically."
    )
  );
  body.appendChild(secMatch);

  // --- Footer help
  body.appendChild(
    el(
      "div",
      "text_muted pme-adv-footer",
      "AUTO mode disables the manual toggle. When enabled, activation is driven by Connections and/or Match rules."
    )
  );

  return wrap;
}

function makeMoveButton(title, iconClass, { disabled = false, onClick }) {
  const btn = el(
    "button",
    "menu_button menu_button_icon pme-icon-btn pme-move-btn"
  );
  btn.type = "button";
  btn.title = title;
  btn.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
  btn.disabled = !!disabled;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (btn.disabled) return;
    onClick?.();
  });
  return btn;
}

function renderItem(
  item,
  {
    onAnyChange,
    canMoveUp = false,
    canMoveDown = false,
    onMoveUp,
    onMoveDown,
  } = {}
) {
  const row = el("div", "pme-item");
  row.dataset.pmeItemId = item.id;
  const autoActive = isAutoActive(item);

  const top = el("div", "pme-item-top");

  const titleInput = el("input", "text_pole pme-item-title");
  titleInput.type = "text";
  titleInput.value = item.title ?? "";
  titleInput.placeholder = "Title";
  titleInput.addEventListener("input", () => {
    patchItem(item.id, { title: titleInput.value });
  });
  top.appendChild(titleInput);

  if (autoActive) {
    const autoTag = el("div", "pme-auto-tag", "AUTO");
    autoTag.title =
      "Auto activation enabled (manual toggle disabled for this item).";
    top.appendChild(autoTag);
  } else {
    const enabledLabel = el("label", "checkbox_label pme-item-enabled");
    const enabled = el("input");
    enabled.type = "checkbox";
    enabled.checked = !!item.enabled;
    enabled.addEventListener("input", () => {
      patchItem(item.id, { enabled: enabled.checked });
      row.classList.toggle("pme-item-disabled", !enabled.checked);
    });
    enabledLabel.appendChild(enabled);
    enabledLabel.appendChild(el("span", "", "Enabled"));
    top.appendChild(enabledLabel);
  }

  const moveUpBtn = makeMoveButton("Move up", "fa-arrow-up", {
    disabled: !canMoveUp,
    onClick: () => {
      onMoveUp?.();
      onAnyChange?.();
    },
  });
  top.appendChild(moveUpBtn);

  const moveDownBtn = makeMoveButton("Move down", "fa-arrow-down", {
    disabled: !canMoveDown,
    onClick: () => {
      onMoveDown?.();
      onAnyChange?.();
    },
  });
  top.appendChild(moveDownBtn);

  const deleteBtn = el(
    "button",
    "menu_button menu_button_icon pme-icon-btn pme-item-delete"
  );
  deleteBtn.type = "button";
  deleteBtn.title = "Delete";
  deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
  deleteBtn.addEventListener("click", () => {
    removeItem(item.id);
    onAnyChange?.();
  });
  top.appendChild(deleteBtn);

  const collapseBtn = el(
    "button",
    "menu_button menu_button_icon pme-icon-btn pme-item-collapse"
  );
  collapseBtn.type = "button";
  collapseBtn.title = item.collapsed ? "Expand" : "Collapse";
  collapseBtn.innerHTML = item.collapsed
    ? '<i class="fa-solid fa-chevron-down"></i>'
    : '<i class="fa-solid fa-chevron-up"></i>';
  top.appendChild(collapseBtn);

  row.appendChild(top);

  const body = el("div", "pme-item-body");
  body.classList.toggle("displayNone", !!item.collapsed);

  const textarea = el("textarea", "text_pole textarea_compact pme-item-text");
  const textareaId = `pme_additional_text_${String(item.id ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  textarea.id = textareaId;
  textarea.rows = 4;
  textarea.value = item.text ?? "";
  textarea.placeholder = "Text to inject when enabled...";

  body.appendChild(textarea);

  const footer = el("div", "pme-item-footer");
  const maxBtn = document.createElement("i");
  maxBtn.className = "editor_maximize fa-solid fa-maximize right_menu_button";
  maxBtn.title = "Expand the editor";
  maxBtn.setAttribute("data-for", textareaId);
  footer.appendChild(maxBtn);

  const tokenBox = el("div", "pme-token-box pme-item-token-box");
  tokenBox.appendChild(el("span", "", "Tokens: "));
  const tokenCount = el("span", "pme-token-count", "0");
  tokenBox.appendChild(tokenCount);
  footer.appendChild(tokenBox);
  body.appendChild(footer);

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

  const onTextInput = () => {
    patchItem(item.id, { text: textarea.value });
    refreshTokens();
  };
  textarea.addEventListener("input", onTextInput);
  try {
    // ST "Expand editor" uses jQuery `.trigger('input')` on the original element.
    // Native listener is not guaranteed to receive that trigger, so we bind both.
    // eslint-disable-next-line no-undef
    if (typeof $ === "function") $(textarea).on("input", onTextInput);
  } catch {
    // ignore
  }

  refreshTokens();

  row.appendChild(body);
  row.classList.toggle("pme-item-disabled", !item.enabled && !autoActive);

  collapseBtn.addEventListener("click", () => {
    const nextCollapsed = !body.classList.contains("displayNone");
    patchItem(item.id, { collapsed: nextCollapsed });
    onAnyChange?.();
  });

  // Advanced (planned)
  body.appendChild(
    renderAdvancedControls(item, {
      kind: "item",
      patch: (p) => patchItem(item.id, p),
      onAnyChange,
    })
  );

  return row;
}

function renderGroup(
  group,
  {
    onAnyChange,
    canMoveUp = false,
    canMoveDown = false,
    onMoveUp,
    onMoveDown,
  } = {}
) {
  const wrap = el("div", "pme-group");
  wrap.dataset.pmeGroupId = group.id;
  const autoActive = isAutoActive(group);

  const top = el("div", "pme-group-top");

  const titleInput = el("input", "text_pole pme-group-title");
  titleInput.type = "text";
  titleInput.value = group.title ?? "";
  titleInput.placeholder = "Group title";
  titleInput.addEventListener("input", () => {
    patchGroup(group.id, { title: titleInput.value });
  });
  top.appendChild(titleInput);

  if (autoActive) {
    const autoTag = el("div", "pme-auto-tag", "AUTO");
    autoTag.title =
      "Auto activation enabled (manual toggle disabled for this group).";
    top.appendChild(autoTag);
  } else {
    const enabledLabel = el("label", "checkbox_label pme-group-enabled");
    const enabled = el("input");
    enabled.type = "checkbox";
    enabled.checked = !!group.enabled;
    enabled.addEventListener("input", () => {
      patchGroup(group.id, { enabled: enabled.checked });
      wrap.classList.toggle("pme-group-disabled", !enabled.checked);
    });
    enabledLabel.appendChild(enabled);
    enabledLabel.appendChild(el("span", "", "Enabled"));
    top.appendChild(enabledLabel);
  }

  const moveUpBtn = makeMoveButton("Move group up", "fa-arrow-up", {
    disabled: !canMoveUp,
    onClick: () => {
      onMoveUp?.();
      onAnyChange?.();
    },
  });
  top.appendChild(moveUpBtn);

  const moveDownBtn = makeMoveButton("Move group down", "fa-arrow-down", {
    disabled: !canMoveDown,
    onClick: () => {
      onMoveDown?.();
      onAnyChange?.();
    },
  });
  top.appendChild(moveDownBtn);

  const addBtn = el("button", "menu_button menu_button_icon pme-group-add");
  addBtn.classList.add("pme-icon-btn");
  addBtn.type = "button";
  addBtn.title = "Add Item";
  addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
  addBtn.addEventListener("click", () => {
    addItemToGroup(group.id);
    onAnyChange?.();
  });
  top.appendChild(addBtn);

  const deleteBtn = el(
    "button",
    "menu_button menu_button_icon pme-icon-btn pme-group-delete"
  );
  deleteBtn.type = "button";
  deleteBtn.title = "Delete Group";
  deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
  deleteBtn.addEventListener("click", () => {
    removeGroup(group.id);
    onAnyChange?.();
  });
  top.appendChild(deleteBtn);

  const collapseBtn = el(
    "button",
    "menu_button menu_button_icon pme-icon-btn pme-group-collapse"
  );
  collapseBtn.type = "button";
  collapseBtn.title = group.collapsed ? "Expand" : "Collapse";
  collapseBtn.innerHTML = group.collapsed
    ? '<i class="fa-solid fa-chevron-down"></i>'
    : '<i class="fa-solid fa-chevron-up"></i>';
  top.appendChild(collapseBtn);

  wrap.appendChild(top);

  const body = el("div", "pme-group-body");
  body.classList.toggle("displayNone", !!group.collapsed);
  wrap.appendChild(body);

  const items = Array.isArray(group.items) ? group.items : [];
  if (!items.length) {
    body.appendChild(el("div", "text_muted", "No items in this group yet."));
  } else {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      body.appendChild(
        renderItem(item, {
          onAnyChange,
          canMoveUp: i > 0,
          canMoveDown: i < items.length - 1,
          onMoveUp: () => moveItemInGroup(group.id, item.id, -1),
          onMoveDown: () => moveItemInGroup(group.id, item.id, +1),
        })
      );
    }
  }

  wrap.classList.toggle("pme-group-disabled", !group.enabled && !autoActive);

  collapseBtn.addEventListener("click", () => {
    const nextCollapsed = !body.classList.contains("displayNone");
    patchGroup(group.id, { collapsed: nextCollapsed });
    onAnyChange?.();
  });

  // Advanced (planned) for group
  body.appendChild(
    renderAdvancedControls(group, {
      kind: "group",
      patch: (p) => patchGroup(group.id, p),
      onAnyChange,
    })
  );

  return wrap;
}

export function createAdditionalDescriptionsCard() {
  let collapsed = false;

  const root = el("div", "pme-card pme-additional");
  const header = el("div", "pme-card-title-row");
  header.appendChild(el("div", "pme-card-title", "Additional Descriptions"));

  const actions = el("div", "pme-actions");

  const fullscreenBtn = el(
    "button",
    "menu_button menu_button_icon pme-icon-btn"
  );
  fullscreenBtn.type = "button";
  fullscreenBtn.title = "Open fullscreen";
  fullscreenBtn.innerHTML =
    '<i class="fa-solid fa-up-right-and-down-left-from-center"></i>';
  actions.appendChild(fullscreenBtn);

  const addBtn = el(
    "button",
    "menu_button menu_button_icon pme-icon-btn pme-add-btn"
  );
  addBtn.type = "button";
  addBtn.title = "Add Item";
  addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
  actions.appendChild(addBtn);

  const addGroupBtn = el(
    "button",
    "menu_button menu_button_icon pme-icon-btn pme-add-group-btn"
  );
  addGroupBtn.type = "button";
  addGroupBtn.title = "Add Group";
  addGroupBtn.innerHTML = '<i class="fa-solid fa-folder-plus"></i>';
  actions.appendChild(addGroupBtn);

  const collapseBtn = el("button", "menu_button menu_button_icon pme-icon-btn");
  collapseBtn.type = "button";
  collapseBtn.title = "Collapse";
  collapseBtn.innerHTML = '<i class="fa-solid fa-chevron-up"></i>';
  actions.appendChild(collapseBtn);

  header.appendChild(actions);
  root.appendChild(header);

  const body = el("div", "pme-additional-body");
  root.appendChild(body);

  const list = el("div", "pme-add-list");
  body.appendChild(list);

  function render() {
    list.innerHTML = "";
    const blocks = listBlocks();
    if (!blocks?.length) {
      list.appendChild(
        el(
          "div",
          "text_muted",
          "No additional descriptions yet. Click + to add an item or G+ to add a group."
        )
      );
      return;
    }
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const canMoveUp = i > 0;
      const canMoveDown = i < blocks.length - 1;
      if (block.type === "item") {
        list.appendChild(
          renderItem(block, {
            onAnyChange: render,
            canMoveUp,
            canMoveDown,
            onMoveUp: () => moveBlock(block.id, -1),
            onMoveDown: () => moveBlock(block.id, +1),
          })
        );
      } else if (block.type === "group") {
        list.appendChild(
          renderGroup(block, {
            onAnyChange: render,
            canMoveUp,
            canMoveDown,
            onMoveUp: () => moveBlock(block.id, -1),
            onMoveDown: () => moveBlock(block.id, +1),
          })
        );
      }
    }
  }

  addBtn.addEventListener("click", () => {
    addItem();
    render();
  });

  addGroupBtn.addEventListener("click", () => {
    addGroup();
    render();
  });

  function syncCollapsed() {
    body.classList.toggle("displayNone", collapsed);
    root.classList.toggle("pme-collapsed", collapsed);
    collapseBtn.title = collapsed ? "Expand" : "Collapse";
    collapseBtn.innerHTML = collapsed
      ? '<i class="fa-solid fa-chevron-down"></i>'
      : '<i class="fa-solid fa-chevron-up"></i>';
  }

  collapseBtn.addEventListener("click", () => {
    collapsed = !collapsed;
    syncCollapsed();
  });

  fullscreenBtn.addEventListener("click", async () => {
    // Create a fresh editor instance for the popup
    const wrapper = el("div", "pme-additional-fullscreen");
    wrapper.appendChild(el("div", "pme-card-title", "Additional Descriptions"));

    const editor = el("div", "pme-add-list");
    wrapper.appendChild(editor);

    const renderPopup = () => {
      editor.innerHTML = "";
      const blocks = listBlocks();
      if (!blocks?.length) {
        editor.appendChild(
          el(
            "div",
            "text_muted",
            "No additional descriptions yet. Click + to add an item or G+ to add a group."
          )
        );
        return;
      }
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const canMoveUp = i > 0;
        const canMoveDown = i < blocks.length - 1;
        if (block.type === "item") {
          editor.appendChild(
            renderItem(block, {
              onAnyChange: () => {
                renderPopup();
                render();
              },
              canMoveUp,
              canMoveDown,
              onMoveUp: () => moveBlock(block.id, -1),
              onMoveDown: () => moveBlock(block.id, +1),
            })
          );
        } else if (block.type === "group") {
          editor.appendChild(
            renderGroup(block, {
              onAnyChange: () => {
                renderPopup();
                render();
              },
              canMoveUp,
              canMoveDown,
              onMoveUp: () => moveBlock(block.id, -1),
              onMoveDown: () => moveBlock(block.id, +1),
            })
          );
        }
      }
    };

    const popupActions = el("div", "pme-actions");
    const addItemBtn2 = el(
      "button",
      "menu_button menu_button_icon pme-icon-btn pme-add-btn"
    );
    addItemBtn2.type = "button";
    addItemBtn2.title = "Add Item";
    addItemBtn2.innerHTML = '<i class="fa-solid fa-plus"></i>';
    addItemBtn2.addEventListener("click", () => {
      addItem();
      renderPopup();
      render();
    });
    popupActions.appendChild(addItemBtn2);

    const addGroupBtn2 = el(
      "button",
      "menu_button menu_button_icon pme-icon-btn pme-add-group-btn"
    );
    addGroupBtn2.type = "button";
    addGroupBtn2.title = "Add Group";
    addGroupBtn2.innerHTML = '<i class="fa-solid fa-folder-plus"></i>';
    addGroupBtn2.addEventListener("click", () => {
      addGroup();
      renderPopup();
      render();
    });
    popupActions.appendChild(addGroupBtn2);

    wrapper.insertBefore(popupActions, editor);
    renderPopup();

    await callGenericPopup(wrapper, POPUP_TYPE.TEXT, "", {
      wide: true,
      large: true,
      allowVerticalScrolling: true,
    });
  });

  return {
    el: root,
    mount() {
      render();
      syncCollapsed();
    },
    update() {
      render();
      syncCollapsed();
    },
  };
}
