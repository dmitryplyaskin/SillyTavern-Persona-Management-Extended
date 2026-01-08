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

  const top = el("div", "pme-item-top");

  const titleInput = el("input", "text_pole pme-item-title");
  titleInput.type = "text";
  titleInput.value = item.title ?? "";
  titleInput.placeholder = "Title";
  titleInput.addEventListener("input", () => {
    patchItem(item.id, { title: titleInput.value });
  });
  top.appendChild(titleInput);

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
  row.classList.toggle("pme-item-disabled", !item.enabled);

  collapseBtn.addEventListener("click", () => {
    const nextCollapsed = !body.classList.contains("displayNone");
    patchItem(item.id, { collapsed: nextCollapsed });
    onAnyChange?.();
  });

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

  const top = el("div", "pme-group-top");

  const titleInput = el("input", "text_pole pme-group-title");
  titleInput.type = "text";
  titleInput.value = group.title ?? "";
  titleInput.placeholder = "Group title";
  titleInput.addEventListener("input", () => {
    patchGroup(group.id, { title: titleInput.value });
  });
  top.appendChild(titleInput);

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

  wrap.classList.toggle("pme-group-disabled", !group.enabled);

  collapseBtn.addEventListener("click", () => {
    const nextCollapsed = !body.classList.contains("displayNone");
    patchGroup(group.id, { collapsed: nextCollapsed });
    onAnyChange?.();
  });

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
