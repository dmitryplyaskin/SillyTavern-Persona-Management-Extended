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

function getPersonaName() {
  return power_user?.personas?.[user_avatar] ?? user_avatar ?? "";
}

export function createAdvancedApp(rootEl) {
  let mounted = false;

  const panel = el("div", "pme-panel");
  const header = el("div", "pme-header");
  header.appendChild(el("div", "pme-title", "Persona Management Extended"));
  panel.appendChild(header);

  const layout = el("div", "pme-layout");
  const left = el("div", "pme-left");
  const right = el("div", "pme-right");
  layout.appendChild(left);
  layout.appendChild(right);
  panel.appendChild(layout);

  const currentPersonaPanel = createCurrentPersonaPanel({
    getPersonaName,
    onDescriptionChanged: () => personaList.updatePreviewOnly(),
    onNativePersonaListMayChange: () =>
      personaList.update({ invalidateCache: true, autoScroll: false }),
  });

  const linksCard = createPersonaLinksGlobalSettingsCard();
  const additionalCard = createAdditionalDescriptionsCard();

  const personaList = createPersonaList({
    getPowerUser: () => power_user,
    onPersonaChanged: () => {
      // ST state updated; refresh only the parts that depend on current persona.
      currentPersonaPanel.update();
      linksCard.update();
      additionalCard.update();
    },
  });

  function mountOnce({ autoScroll = false } = {}) {
    if (mounted) return;
    mounted = true;

    rootEl.appendChild(panel);

    left.appendChild(personaList.el);
    right.appendChild(currentPersonaPanel.el);
    right.appendChild(linksCard.el);
    right.appendChild(additionalCard.el);

    personaList.mount({ autoScroll });
    currentPersonaPanel.mount();
    linksCard.mount();
    additionalCard.mount();
  }

  return {
    open({ autoScroll = false } = {}) {
      mountOnce({ autoScroll });
      personaList.update({ invalidateCache: false, autoScroll });
      currentPersonaPanel.update();
      linksCard.update();
      additionalCard.update();
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
    },
    destroy() {
      if (!mounted) return;
      mounted = false;
      try {
        linksCard.destroy?.();
      } finally {
        restoreNativePersonaLinksBlocks();
        rootEl.innerHTML = "";
      }
    },
  };
}

