/**
 * Persona Management Extended - Settings Module
 * Adds extension settings UI and migration from User Persona Extended.
 */

import { saveSettingsDebounced } from "/script.js";
import {
  extension_settings,
  renderExtensionTemplateAsync,
} from "../../../extensions.js";
import { accountStorage } from "/scripts/util/AccountStorage.js";
import { callGenericPopup, POPUP_TYPE } from "../../../popup.js";
import { power_user } from "/scripts/power-user.js";

import { PME } from "./src/core/constants.js";

/**
 * Extension settings key
 */
const SETTINGS_KEY = "personaManagementExtended";

/**
 * Legacy extension storage key prefix (User Persona Extended)
 */
const LEGACY_STORAGE_KEY_PREFIX = "user_persona_extended_";

/**
 * Default settings
 */
const defaultSettings = {
  enabled: true,
};

let settingsUIInitialized = false;

function makeId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadSettings() {
  if (!extension_settings[SETTINGS_KEY]) {
    extension_settings[SETTINGS_KEY] = { ...defaultSettings };
    saveSettingsDebounced();
  }

  let shouldSave = false;
  for (const key in defaultSettings) {
    if (!(key in extension_settings[SETTINGS_KEY])) {
      extension_settings[SETTINGS_KEY][key] = defaultSettings[key];
      shouldSave = true;
    }
  }
  if (shouldSave) saveSettingsDebounced();

  const $checkbox = $("#pme-enabled");
  if ($checkbox.length) {
    $checkbox.prop(
      "checked",
      extension_settings[SETTINGS_KEY].enabled !== false
    );
  }
}

export function isExtensionEnabled() {
  if (!extension_settings[SETTINGS_KEY]) {
    loadSettings();
  }
  return extension_settings[SETTINGS_KEY]?.enabled !== false;
}

async function clearAllExtensionData() {
  const confirmed = await callGenericPopup(
    `<div class="text_pole">
      <p><strong>Are you sure you want to delete all extension data?</strong></p>
      <p>This will permanently delete:</p>
      <p>- All saved Additional Descriptions blocks for all personas</p>
      <p>- Extension settings (will be reset to defaults)</p>
      <p>This action cannot be undone.</p>
    </div>`,
    POPUP_TYPE.CONFIRM,
    "",
    { wide: true }
  );

  if (!confirmed) return;

  try {
    const personaDescriptions = power_user?.persona_descriptions ?? {};
    let deletedPersonaCount = 0;

    for (const avatarId in personaDescriptions) {
      const desc = personaDescriptions?.[avatarId];
      if (desc && typeof desc === "object" && "pme" in desc) {
        delete desc.pme;
        deletedPersonaCount++;
      }
    }

    // Reset extension settings to defaults
    extension_settings[SETTINGS_KEY] = { ...defaultSettings };

    // Reset local UI prefs
    accountStorage.removeItem(PME.storage.advancedModeKey);
    accountStorage.removeItem(PME.storage.personaSortKey);

    saveSettingsDebounced();
    loadSettings();

    toastr.success(
      `Deleted PME data for ${deletedPersonaCount} persona(s) and reset settings`,
      "Data Cleared"
    );
  } catch (err) {
    console.error("[PME]: Error clearing data:", err);
    toastr.error("Failed to clear extension data", "Error");
  }
}

async function importFromUserPersonaExtended() {
  const confirmed = await callGenericPopup(
    `<div class="text_pole">
      <p><strong>Import Additional Descriptions from "User Persona Extended"?</strong></p>
      <p>This will:</p>
      <p>- Read legacy data from account storage</p>
      <p>- Import legacy entries as individual items (flat list)</p>
      <p>- Preserve item order (title/description/enabled)</p>
      <p>No existing PME items will be deleted.</p>
    </div>`,
    POPUP_TYPE.CONFIRM,
    "",
    { wide: true }
  );

  if (!confirmed) return;

  try {
    const state = accountStorage.getState();
    const keys = Object.keys(state || {}).filter((k) =>
      String(k).startsWith(LEGACY_STORAGE_KEY_PREFIX)
    );

    if (!keys.length) {
      toastr.info("No legacy data found to import", "Import");
      return;
    }

    const personaDescriptions = (power_user.persona_descriptions ??= {});
    let importedPersonaCount = 0;
    let importedItemCount = 0;

    for (const storageKey of keys) {
      const avatarId = String(storageKey).slice(
        LEGACY_STORAGE_KEY_PREFIX.length
      );
      if (!avatarId) continue;

      const raw = accountStorage.getItem(storageKey);
      if (!raw) continue;

      let legacy = null;
      try {
        legacy = JSON.parse(raw);
      } catch {
        legacy = null;
      }
      if (!Array.isArray(legacy) || legacy.length === 0) continue;

      const items = legacy
        .filter((x) => x && typeof x === "object")
        .map((x, idx) => {
          const title = String(x.title ?? "").trim() || `Item ${idx + 1}`;
          const text = String(x.description ?? "");
          const enabled = x.enabled !== false;
          const id = String(x.id ?? "").trim() || makeId();
          return { type: "item", id, title, text, enabled, collapsed: false };
        })
        .filter(
          (it) =>
            String(it.text ?? "").trim().length > 0 ||
            String(it.title ?? "").trim().length > 0
        );

      if (!items.length) continue;

      personaDescriptions[avatarId] ??= {};
      const target = personaDescriptions[avatarId];
      target.pme ??= { version: 1, blocks: [] };
      target.pme.version = 1;
      target.pme.blocks ??= [];

      // Flat import: legacy extension had no group semantics
      target.pme.blocks.push(...items);

      importedPersonaCount++;
      importedItemCount += items.length;
    }

    if (importedPersonaCount === 0) {
      toastr.info(
        "Legacy data was found, but nothing could be imported",
        "Import"
      );
      return;
    }

    saveSettingsDebounced();

    toastr.success(
      `Imported ${importedItemCount} item(s) into ${importedPersonaCount} persona(s)`,
      "Import Complete"
    );
  } catch (err) {
    console.error("[PME]: Import failed:", err);
    toastr.error("Failed to import legacy data", "Error");
  }
}

export async function initSettingsUI() {
  if (settingsUIInitialized) return;

  // Already mounted by something else
  if ($("#pme_settings").length) {
    settingsUIInitialized = true;
    loadSettings();
    return;
  }

  try {
    const settingsHtml = await renderExtensionTemplateAsync(
      "third-party/SillyTavern-Persona-Management-Extended",
      "settings"
    );

    const getContainer = () =>
      $(
        document.getElementById("pme_settings_container") ??
          document.getElementById("extensions_settings")
      );

    const $container = getContainer();
    if (!$container.length) {
      console.warn("[PME]: Settings container not found, retrying later...");
      return;
    }

    if ($("#pme_settings").length) {
      settingsUIInitialized = true;
      loadSettings();
      return;
    }

    $container.append(settingsHtml);
    settingsUIInitialized = true;

    loadSettings();

    // Enable/disable
    $(document)
      .off("change", "#pme-enabled")
      .on("change", "#pme-enabled", function () {
        extension_settings[SETTINGS_KEY].enabled = $(this).prop("checked");
        saveSettingsDebounced();
      });

    // Import
    $(document)
      .off("click", "#pme-import-from-user-persona-extended")
      .on("click", "#pme-import-from-user-persona-extended", async function () {
        await importFromUserPersonaExtended();
      });

    // Clear all data
    $(document)
      .off("click", "#pme-clear-all-data")
      .on("click", "#pme-clear-all-data", async function () {
        await clearAllExtensionData();
      });
  } catch (err) {
    console.error("[PME]: Settings UI initialization error:", err);
  }
}
