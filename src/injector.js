import { PME } from "./core/constants.js";
import { log } from "./core/log.js";
import { isExtensionEnabled } from "../settings.js";

import { eventSource, event_types } from "/script.js";
import {
  power_user,
  persona_description_positions,
} from "/scripts/power-user.js";
import {
  getOrCreatePersonaDescriptor,
  user_avatar,
} from "/scripts/personas.js";

const WRAPPER_PLACEHOLDER = "{{PROMPT}}";
const DEFAULT_ADDITIONAL_JOINER_RAW = "\\n\\n";
const DEFAULT_WRAPPER_TEMPLATE = `<tag>${WRAPPER_PLACEHOLDER}</tag>`;

/**
 * We need to apply the patch BEFORE SillyTavern computes `persona` via `getCharacterCardFields()`.
 * That happens before `runGenerationInterceptors()` runs.
 *
 * So we:
 * - apply runtime patch on GENERATION_AFTER_COMMANDS (and keep generate_interceptor as a safety net),
 * - restore on GENERATION_ENDED / GENERATION_STOPPED,
 * - never save settings / never touch DOM, only runtime power_user values.
 */

/**
 * @typedef {object} PersonaSnapshot
 * @property {string} persona_description
 * @property {number} persona_description_position
 * @property {number} persona_description_depth
 * @property {number} persona_description_role
 */

/** @type {{active: boolean, snapshot: PersonaSnapshot|null, restoreTimer?: number}|null} */
let patchState = null;

function ensurePatchState() {
  patchState ??= { active: false, snapshot: null };
  return patchState;
}

/**
 * @param {any} descriptor
 */
function isLinkedToNative(descriptor) {
  return descriptor?.pme?.linkedToNative !== false;
}

function getPmeSettingsSnapshot(descriptor) {
  const s = descriptor?.pme?.settings;
  return {
    wrapperEnabled: s?.wrapperEnabled === true,
    wrapperTemplate:
      typeof s?.wrapperTemplate === "string"
        ? s.wrapperTemplate
        : DEFAULT_WRAPPER_TEMPLATE,
    additionalJoiner:
      typeof s?.additionalJoiner === "string"
        ? s.additionalJoiner
        : DEFAULT_ADDITIONAL_JOINER_RAW,
  };
}

/**
 * Turns user-friendly escape sequences into real characters.
 * Supports: \n, \r, \t, \\.
 * Unknown sequences keep the escaped character as-is (e.g. "\x" => "x").
 *
 * @param {string} raw
 */
function parseEscapes(raw) {
  const s = String(raw ?? "");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = s[i + 1];
    if (next === undefined) {
      out += "\\";
      continue;
    }
    i++;
    if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "\\") out += "\\";
    else out += next;
  }
  return out;
}

/**
 * Collect enabled Additional Description texts in the canonical order.
 * Titles/group names are UI-only and must NOT be included in the prompt.
 *
 * @param {any} descriptor
 * @returns {string[]}
 */
function collectEnabledAdditionalTexts(descriptor) {
  const blocks = descriptor?.pme?.blocks;
  if (!Array.isArray(blocks) || blocks.length === 0) return [];

  /** @type {string[]} */
  const out = [];

  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;

    if (b.type === "item") {
      if (b.enabled === false) continue;
      const raw = String(b.text ?? "");
      // NOTE: emptiness check uses trim(), but the injected value must stay unmodified.
      if (raw.trim().length > 0) out.push(raw);
      continue;
    }

    if (b.type === "group") {
      if (b.enabled === false) continue;
      const items = Array.isArray(b.items) ? b.items : [];
      for (const it of items) {
        if (!it || typeof it !== "object") continue;
        if (it.enabled === false) continue;
        const raw = String(it.text ?? "");
        // NOTE: emptiness check uses trim(), but the injected value must stay unmodified.
        if (raw.trim().length > 0) out.push(raw);
      }
    }
  }

  return out;
}

/**
 * Build the final persona description text for generation.
 * - Base comes from native power_user OR from `descriptor.pme.local` when unlinked.
 * - Additional Descriptions are appended in order, only enabled ones.
 *
 * @param {any} descriptor
 */
function buildFinalPersona(descriptor) {
  const linked = isLinkedToNative(descriptor);
  const settings = getPmeSettingsSnapshot(descriptor);
  const joiner = parseEscapes(
    settings.additionalJoiner || DEFAULT_ADDITIONAL_JOINER_RAW
  );

  const baseRaw = linked
    ? String(power_user?.persona_description ?? "")
    : String(descriptor?.pme?.local?.description ?? "");

  const additions = collectEnabledAdditionalTexts(descriptor);
  // Do NOT trim the combined text; only empty blocks are filtered out.
  const additionsText = additions.join(joiner);

  const baseHasContent = baseRaw.trim().length > 0;
  const finalText = baseHasContent
    ? additionsText
      ? `${baseRaw}${joiner}${additionsText}`
      : baseRaw
    : additionsText;

  const wrappedText =
    settings.wrapperEnabled && String(finalText).trim().length > 0
      ? (() => {
          const tpl = String(
            settings.wrapperTemplate ?? DEFAULT_WRAPPER_TEMPLATE
          );
          if (!tpl) return finalText;
          if (tpl.includes(WRAPPER_PLACEHOLDER)) {
            // Replace ALL occurrences
            return tpl.split(WRAPPER_PLACEHOLDER).join(String(finalText));
          }
          // Fallback: append (keep user data intact, but avoid dropping prompt)
          return `${tpl}${finalText}`;
        })()
      : finalText;

  // Position/depth/role are only overridden when using the unlinked local payload.
  const finalPosition = linked
    ? Number(
        power_user?.persona_description_position ??
          persona_description_positions.IN_PROMPT
      )
    : Number(
        descriptor?.pme?.local?.position ??
          persona_description_positions.IN_PROMPT
      );

  const finalDepth = linked
    ? Number(power_user?.persona_description_depth ?? 2)
    : Number(descriptor?.pme?.local?.depth ?? 2);

  const finalRole = linked
    ? Number(power_user?.persona_description_role ?? 0)
    : Number(descriptor?.pme?.local?.role ?? 0);

  return {
    linked,
    finalText: wrappedText,
    finalPosition,
    finalDepth,
    finalRole,
    hasAnyEffect: Boolean(wrappedText && String(wrappedText).trim().length > 0),
  };
}

function snapshotPowerUser() {
  return {
    persona_description: String(power_user?.persona_description ?? ""),
    persona_description_position: Number(
      power_user?.persona_description_position ??
        persona_description_positions.IN_PROMPT
    ),
    persona_description_depth: Number(
      power_user?.persona_description_depth ?? 2
    ),
    persona_description_role: Number(power_user?.persona_description_role ?? 0),
  };
}

function restorePowerUser(snapshot) {
  if (!snapshot) return;
  power_user.persona_description = snapshot.persona_description;
  power_user.persona_description_position =
    snapshot.persona_description_position;
  power_user.persona_description_depth = snapshot.persona_description_depth;
  power_user.persona_description_role = snapshot.persona_description_role;
}

/**
 * Apply runtime patch (idempotent).
 * @param {string} reason
 */
function applyPatch(reason) {
  const st = ensurePatchState();
  if (st.active) return;

  if (!isExtensionEnabled()) return;

  const descriptor = getOrCreatePersonaDescriptor();
  const { finalText, finalPosition, finalDepth, finalRole, hasAnyEffect } =
    buildFinalPersona(descriptor);

  // If nothing to inject/apply, don't touch runtime state.
  if (!hasAnyEffect) return;

  // Respect user disabling persona description entirely.
  if (finalPosition === persona_description_positions.NONE) return;

  const snap = snapshotPowerUser();

  // Avoid no-op patching when nothing changes.
  if (
    String(snap.persona_description) === String(finalText) &&
    Number(snap.persona_description_position) === Number(finalPosition) &&
    Number(snap.persona_description_depth) === Number(finalDepth) &&
    Number(snap.persona_description_role) === Number(finalRole)
  ) {
    return;
  }

  st.snapshot = snap;
  st.active = true;

  power_user.persona_description = finalText;
  power_user.persona_description_position = finalPosition;
  power_user.persona_description_depth = finalDepth;
  power_user.persona_description_role = finalRole;

  log(
    `Applied persona injection (${reason})`,
    `{avatarId=${String(user_avatar ?? "")}, len=${finalText.length}}`
  );

  // Safety net: if for some reason end events don't fire, restore soon.
  if (st.restoreTimer) window.clearTimeout(st.restoreTimer);
  st.restoreTimer = window.setTimeout(() => {
    restorePatch("timer");
  }, 30_000);
}

/**
 * Restore runtime patch (idempotent).
 * @param {string} reason
 */
function restorePatch(reason) {
  const st = ensurePatchState();
  if (!st.active) return;

  try {
    restorePowerUser(st.snapshot);
  } finally {
    st.active = false;
    st.snapshot = null;
    if (st.restoreTimer) {
      window.clearTimeout(st.restoreTimer);
      st.restoreTimer = undefined;
    }
  }

  log(`Restored persona injection (${reason})`);
}

let hooksInstalled = false;

/**
 * Register a generate interceptor hook.
 *
 * NOTE: We also install generation lifecycle hooks because `getCharacterCardFields()`
 * (which computes the `persona` string) is called BEFORE `runGenerationInterceptors()`.
 */
export function registerGenerateInterceptor() {
  if (!hooksInstalled) {
    hooksInstalled = true;

    // Apply before prompt fields are captured (critical).
    eventSource.on(
      event_types.GENERATION_AFTER_COMMANDS,
      (_type, _meta, dryRun) => {
        if (dryRun) return;
        applyPatch("GENERATION_AFTER_COMMANDS");
      }
    );

    // Restore in all normal/abort paths.
    eventSource.on(event_types.GENERATION_ENDED, () =>
      restorePatch("GENERATION_ENDED")
    );
    eventSource.on(event_types.GENERATION_STOPPED, () =>
      restorePatch("GENERATION_STOPPED")
    );
  }

  if (typeof globalThis[PME.interceptor.globalKey] === "function") {
    return;
  }

  globalThis[PME.interceptor.globalKey] = async (
    _chat,
    _contextSize,
    _abort,
    _type
  ) => {
    // Safety net: if for some reason the early hook didn't run, apply here.
    // (This is late for `persona` computed by getCharacterCardFields, but still affects
    // persona extension prompts and other consumers.)
    applyPatch("generate_interceptor");
  };

  log(
    `Registered generate interceptor: globalThis.${PME.interceptor.globalKey} (active)`
  );
}
