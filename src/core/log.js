import { PME } from "./constants.js";

export function log(...args) {
  // eslint-disable-next-line no-console
  console.log(`[${PME.id.toUpperCase()}]`, ...args);
}

export function warn(...args) {
  // eslint-disable-next-line no-console
  console.warn(`[${PME.id.toUpperCase()}]`, ...args);
}

export function error(...args) {
  // eslint-disable-next-line no-console
  console.error(`[${PME.id.toUpperCase()}]`, ...args);
}

