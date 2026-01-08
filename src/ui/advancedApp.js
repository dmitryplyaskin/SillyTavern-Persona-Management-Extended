import { power_user } from "/scripts/power-user.js";
import { user_avatar } from "/scripts/personas.js";

import { el } from "./components/dom.js";
import { createPersonaList } from "./components/personaList.js";
import { createCurrentPersonaPanel } from "./components/currentPersonaPanel.js";
import {
  createPersonaLinksGlobalSettingsCard,
  restoreNativePersonaLinksBlocks,
} from "./components/personaLinksGlobalSettings.js";
import { createAdditionalDescriptionsCard } from "./components/additionalDescriptions.js";
import { createSettingsCard } from "./components/settingsCard.js";
import { createUiBus, UI_EVENTS } from "./uiBus.js";

function getPersonaName() {
  return power_user?.personas?.[user_avatar] ?? user_avatar ?? "";
}

export function createAdvancedApp(rootEl) {
  let mounted = false;
  const bus = createUiBus();

  const panel = el("div", "pme-panel");

  const layout = el("div", "pme-layout");
  const left = el("div", "pme-left");
  const right = el("div", "pme-right");
  layout.appendChild(left);
  layout.appendChild(right);
  panel.appendChild(layout);

  const currentPersonaPanel = createCurrentPersonaPanel({
    getPersonaName,
    bus,
  });

  const linksCard = createPersonaLinksGlobalSettingsCard({ bus });
  const additionalCard = createAdditionalDescriptionsCard();
  const settingsCard = createSettingsCard();

  const personaList = createPersonaList({
    getPowerUser: () => power_user,
    bus,
  });

  // Wire updates via bus (decoupled)
  bus.on(UI_EVENTS.PERSONA_CHANGED, () => {
    currentPersonaPanel.update();
    linksCard.update();
    additionalCard.update();
    settingsCard.update();
  });
  bus.on(UI_EVENTS.PERSONA_DESC_CHANGED, () => {
    personaList.updatePreviewOnly();
  });
  bus.on(UI_EVENTS.PERSONA_LIST_INVALIDATED, () => {
    personaList.update({ invalidateCache: true, autoScroll: false });
  });

  function mountOnce({ autoScroll = false } = {}) {
    if (mounted) return;
    mounted = true;

    rootEl.appendChild(panel);

    left.appendChild(personaList.el);
    right.appendChild(currentPersonaPanel.el);
    right.appendChild(linksCard.el);
    right.appendChild(additionalCard.el);
    right.appendChild(settingsCard.el);

    personaList.mount({ autoScroll });
    currentPersonaPanel.mount();
    linksCard.mount();
    additionalCard.mount();
    settingsCard.mount();
  }

  return {
    bus,
    open({ autoScroll = false } = {}) {
      mountOnce({ autoScroll });
      bus.emit(UI_EVENTS.UI_OPEN, { autoScroll });
      personaList.update({ invalidateCache: false, autoScroll });
      currentPersonaPanel.update();
      linksCard.update();
      additionalCard.update();
      settingsCard.update();
    },
    refreshPersonas({ invalidateCache = false, autoScroll = false } = {}) {
      if (!mounted) return;
      personaList.update({ invalidateCache, autoScroll });
    },
    refreshAll() {
      if (!mounted) return;
      currentPersonaPanel.update();
      linksCard.update();
      additionalCard.update();
      settingsCard.update();
    },
    destroy() {
      if (!mounted) return;
      mounted = false;
      bus.emit(UI_EVENTS.UI_CLOSE, {});
      try {
        linksCard.destroy?.();
      } finally {
        restoreNativePersonaLinksBlocks();
        rootEl.innerHTML = "";
      }
    },
  };
}
