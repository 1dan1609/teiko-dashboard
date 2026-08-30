import { fetchOverview, fetchResponderComparison, fetchBaselineSubset, fetchRawData } from "./api.js";
import { initOverview } from "./overview.js";
import { initResponder } from "./responder.js";
import { initBaseline } from "./baseline.js";
import { initRawData } from "./rawdata.js";

const TABS = {
  overview: { fetch: fetchOverview, init: initOverview, panel: "panel-overview" },
  responder: { fetch: fetchResponderComparison, init: initResponder, panel: "panel-responder" },
  baseline: { fetch: fetchBaselineSubset, init: initBaseline, panel: "panel-baseline" },
  rawdata: { fetch: fetchRawData, init: initRawData, panel: "panel-rawdata" },
};

const loaded = new Set();

async function activateTab(name) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === name);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === TABS[name].panel);
  });

  if (loaded.has(name)) return;
  await loadTab(name);
}

async function loadTab(name) {
  const panel = document.getElementById(TABS[name].panel);
  panel.innerHTML = `<p class="caption">Loading&hellip;</p>`;

  try {
    const data = await TABS[name].fetch();
    TABS[name].init(panel, data);
    loaded.add(name);
  } catch (err) {
    panel.innerHTML = `
      <p class="caption">Failed to load: ${err.message}</p>
      <button type="button" class="retry-btn" id="retry-${name}">Retry</button>
    `;
    document.getElementById(`retry-${name}`).addEventListener("click", () => loadTab(name));
  }
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

activateTab("overview");
