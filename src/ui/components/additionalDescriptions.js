import { el } from "./dom.js";
import { addItem, listItems, patchItem, removeItem } from "../../store/personaStore.js";

function renderItem(item, { onAnyChange }) {
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

  const deleteBtn = el("button", "menu_button menu_button_icon pme-item-delete");
  deleteBtn.type = "button";
  deleteBtn.title = "Delete";
  deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
  deleteBtn.addEventListener("click", () => {
    removeItem(item.id);
    onAnyChange?.();
  });
  top.appendChild(deleteBtn);

  const collapseBtn = el("button", "menu_button menu_button_icon pme-item-collapse");
  collapseBtn.type = "button";
  collapseBtn.title = item.collapsed ? "Expand" : "Collapse";
  collapseBtn.innerHTML = item.collapsed
    ? '<i class="fa-solid fa-chevron-down"></i>'
    : '<i class="fa-solid fa-chevron-up"></i>';
  top.appendChild(collapseBtn);

  row.appendChild(top);

  const body = el("div", "pme-item-body");
  body.classList.toggle("displayNone", !!item.collapsed);

  const textarea = el("textarea", "text_pole pme-item-text");
  textarea.rows = 4;
  textarea.value = item.text ?? "";
  textarea.placeholder = "Text to inject when enabled...";
  textarea.addEventListener("input", () => patchItem(item.id, { text: textarea.value }));
  body.appendChild(textarea);

  row.appendChild(body);
  row.classList.toggle("pme-item-disabled", !item.enabled);

  collapseBtn.addEventListener("click", () => {
    const nextCollapsed = !body.classList.contains("displayNone");
    patchItem(item.id, { collapsed: nextCollapsed });
    onAnyChange?.();
  });

  return row;
}

export function createAdditionalDescriptionsCard() {
  const root = el("div", "pme-card pme-additional");
  const header = el("div", "pme-card-title-row");
  header.appendChild(el("div", "pme-card-title", "Additional Descriptions"));

  const actions = el("div", "pme-actions");
  const addBtn = el("button", "menu_button menu_button_icon pme-add-btn");
  addBtn.type = "button";
  addBtn.title = "Add";
  addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
  actions.appendChild(addBtn);
  header.appendChild(actions);
  root.appendChild(header);

  const list = el("div", "pme-add-list");
  root.appendChild(list);

  function render() {
    list.innerHTML = "";
    const items = listItems();
    if (!items.length) {
      list.appendChild(
        el("div", "text_muted", "No additional descriptions yet. Click + to add one.")
      );
      return;
    }
    for (const item of items) list.appendChild(renderItem(item, { onAnyChange: render }));
  }

  addBtn.addEventListener("click", () => {
    addItem();
    render();
  });

  return {
    el: root,
    mount() {
      render();
    },
    update() {
      render();
    },
  };
}

