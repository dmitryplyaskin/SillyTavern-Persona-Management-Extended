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

