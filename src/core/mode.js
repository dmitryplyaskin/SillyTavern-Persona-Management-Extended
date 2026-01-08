import { accountStorage } from "/scripts/util/AccountStorage.js";
import { PME } from "./constants.js";

/**
 * @returns {boolean}
 */
export function getAdvancedModeEnabled() {
  return accountStorage.getItem(PME.storage.advancedModeKey) === "true";
}

/**
 * @param {boolean} enabled
 */
export function setAdvancedModeEnabled(enabled) {
  accountStorage.setItem(PME.storage.advancedModeKey, String(!!enabled));
}

/**
 * @typedef {"name_asc"|"name_desc"|"id_asc"|"id_desc"|"desc_len_asc"|"desc_len_desc"|"connections_asc"|"connections_desc"|"lorebook_first"|"lorebook_last"} PersonaSortMode
 */

/**
 * @returns {PersonaSortMode}
 */
export function getPersonaSortMode() {
  const value = String(
    accountStorage.getItem(PME.storage.personaSortKey) ?? ""
  );
  if (
    [
      "name_asc",
      "name_desc",
      "id_asc",
      "id_desc",
      "desc_len_asc",
      "desc_len_desc",
      "connections_asc",
      "connections_desc",
      "lorebook_first",
      "lorebook_last",
    ].includes(value)
  ) {
    return /** @type {PersonaSortMode} */ (value);
  }
  return "name_asc";
}

/**
 * @param {PersonaSortMode} mode
 */
export function setPersonaSortMode(mode) {
  accountStorage.setItem(PME.storage.personaSortKey, String(mode));
}
