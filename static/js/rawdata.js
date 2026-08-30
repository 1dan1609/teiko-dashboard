import { computeColumnStats, escapeHtml, formatInt, formatLabel, renderCheckboxGroup, renderPaginatedTable, renderTable, sortRows, sortValues } from "./common.js";

// Always-visible categorical filters (small, fixed cardinality).
const ALWAYS_FILTERS = [
  { key: "project", label: "Project" },
  { key: "condition", label: "Condition" },
  { key: "treatment", label: "Treatment" },
  { key: "sample_type", label: "Sample Type" },
];

// Filters the user can add on demand via the "+ Add filter" menu, each
// rendered with a control appropriate to the field (free text for
// high-cardinality identifiers, checkboxes for small categorical sets,
// a min/max range for numeric fields).
const ADDABLE_FILTERS = [
  { key: "subject", label: "Subject", type: "text" },
  { key: "sample", label: "Sample", type: "text" },
  { key: "sex", label: "Sex", type: "checkbox" },
  { key: "response", label: "Response", type: "checkbox" },
  { key: "time_from_treatment_start", label: "Time From Treatment Start", type: "checkbox" },
  { key: "age", label: "Age", type: "range" },
];

const TYPE_GROUP_LABELS = { text: "Text", checkbox: "Checkbox", range: "Range" };

// Column headers are humanized for readability. Unlike Overview's
// `population` column, no spec constrains this tab's header text, so only the
// header text changes and the underlying row values stay raw.
const COLUMNS = [
  "project", "subject", "condition", "age", "sex", "treatment", "response",
  "sample", "sample_type", "time_from_treatment_start",
  "b_cell", "cd8_t_cell", "cd4_t_cell", "nk_cell", "monocyte",
].map((key) => ({ key, label: formatLabel(key), sortable: true }));

const BLANK = "(blank)";
const displayValue = (v) => (v === null || v === "" ? BLANK : String(v));

// Columns worth summarizing: the five measured populations plus patient age.
// `time_from_treatment_start` is deliberately absent. It is an ordinal study
// timepoint (0/7/14) stored as an integer, so its mean describes no real
// quantity even though it would compute happily.
const SUMMARY_COLUMNS = ["age", "b_cell", "cd8_t_cell", "cd4_t_cell", "nk_cell", "monocyte"].map(
  (key) => ({ key, label: formatLabel(key) })
);

// Plain fixed-decimal rather than a locale string: these values get read off
// and typed back into reports verbatim, and thousands separators invite
// transcription errors.
const formatStat = (v) => (v === null ? "n/a" : v.toFixed(2));

// Every measure is right-aligned so decimal points stack down the column:
// reading this panel means comparing magnitudes across rows, and ragged-left
// decimals make "10206.15" and "5378.73" look the same width.
const STAT_COLUMNS = [
  { key: "column", label: "Variable" },
  { key: "n", label: "N", align: "right", render: (r) => formatInt(r.n) },
  { key: "mean", label: "Mean", align: "right", render: (r) => formatStat(r.mean) },
  { key: "median", label: "Median", align: "right", render: (r) => formatStat(r.median) },
  { key: "stdDev", label: "Std Dev", align: "right", render: (r) => formatStat(r.stdDev) },
  { key: "min", label: "Min", align: "right", render: (r) => formatStat(r.min) },
  { key: "max", label: "Max", align: "right", render: (r) => formatStat(r.max) },
];

export function initRawData(container, data) {
  const { rows } = data;

  container.innerHTML = `
    <div class="section-header">Full Dataset</div>
    <div class="filters-row" id="rawdata-always-filters"></div>
    <div class="filters-row" id="rawdata-extra-filters"></div>
    <div class="filter-toolbar">
      <div class="add-filter-wrap">
        <button type="button" class="add-filter-btn" id="rawdata-add-filter-btn" aria-haspopup="true" aria-expanded="false">+ Add filter</button>
        <div class="add-filter-menu" id="rawdata-add-filter-menu" role="menu" hidden></div>
      </div>
      <button type="button" class="clear-filters-btn" id="rawdata-clear-filters-btn">Clear all filters</button>
      <span class="filter-status" id="rawdata-filter-status" aria-live="polite"></span>
    </div>
    <div class="section-header">Filtered Rows</div>
    <div id="rawdata-table"></div>
    <p class="caption" id="rawdata-caption" aria-live="polite"></p>
    <div class="section-header">Summary Statistics</div>
    <p class="caption" id="rawdata-stats-caption" aria-live="polite"></p>
    <div id="rawdata-stats"></div>
  `;

  const alwaysFiltersEl = container.querySelector("#rawdata-always-filters");
  const extraFiltersEl = container.querySelector("#rawdata-extra-filters");
  const addBtn = container.querySelector("#rawdata-add-filter-btn");
  const addMenu = container.querySelector("#rawdata-add-filter-menu");
  const clearBtn = container.querySelector("#rawdata-clear-filters-btn");
  const statusEl = container.querySelector("#rawdata-filter-status");
  const statsEl = container.querySelector("#rawdata-stats");
  const statsCaptionEl = container.querySelector("#rawdata-stats-caption");
  const tableEl = container.querySelector("#rawdata-table");
  const captionEl = container.querySelector("#rawdata-caption");

  const predicates = new Map(); // key -> (row) => boolean
  const alwaysCheckboxRows = [];
  let sortState = null;

  function applyFilters() {
    const active = [...predicates.values()];
    let filtered = rows.filter((row) => active.every((pred) => pred(row)));
    if (sortState) filtered = sortRows(filtered, sortState.key, sortState.direction);

    // Summarizes every filtered row, not just the page currently rendered
    // below. The panel answers "what do the rows I selected look like",
    // which pagination must not silently narrow.
    if (filtered.length === 0) {
      statsEl.innerHTML = `<div class="empty-state"><p>No rows match your filters, so there is nothing to summarize.</p></div>`;
      statsCaptionEl.textContent = "";
    } else {
      renderTable(statsEl, STAT_COLUMNS, computeColumnStats(filtered, SUMMARY_COLUMNS));
      statsCaptionEl.textContent = `Across all ${formatInt(filtered.length)} filtered row${filtered.length === 1 ? "" : "s"}`;
    }

    renderPaginatedTable(tableEl, COLUMNS, filtered, {
      emptyMessage: "No rows match your filters.",
      onClear: clearAllFilters,
      sortState,
      onSort: (key) => {
        sortState = { key, direction: sortState?.key === key && sortState.direction === "asc" ? "desc" : "asc" };
        applyFilters();
      },
    });
    captionEl.textContent = `Showing ${formatInt(filtered.length)} of ${formatInt(rows.length)} rows`;

    const extraCount = activeExtra.size;
    statusEl.textContent = extraCount > 0 ? `${extraCount} additional filter${extraCount === 1 ? "" : "s"} active` : "";
  }

  // Always-on checkbox filters (Project / Condition / Treatment / Sample Type)
  ALWAYS_FILTERS.forEach((field) => {
    const options = sortValues([...new Set(rows.map((r) => r[field.key]))]);
    const group = document.createElement("div");
    group.className = "filter-group filter-group--checkbox";
    group.innerHTML = `<label>${escapeHtml(field.label)}</label><div class="checkbox-row" id="rawdata-always-${field.key}"></div>`;
    alwaysFiltersEl.appendChild(group);
    const checkboxRow = group.querySelector(".checkbox-row");
    const getSelected = renderCheckboxGroup(checkboxRow, options, { format: formatLabel });
    predicates.set(field.key, (row) => getSelected().has(String(row[field.key])));
    checkboxRow.addEventListener("change", applyFilters);
    alwaysCheckboxRows.push(checkboxRow);
  });

  const activeExtra = new Set();

  function clearAllFilters() {
    alwaysCheckboxRows.forEach((row) => {
      row.querySelectorAll("input[type=checkbox]").forEach((cb) => (cb.checked = true));
    });
    [...extraFiltersEl.children].forEach((group) => group.remove());
    activeExtra.clear();
    // Always-on filter predicates stay registered (they just read "all
    // checked" again above); only extra-filter predicates need removing.
    for (const def of ADDABLE_FILTERS) predicates.delete(def.key);
    applyFilters();
  }

  function renderAddMenu() {
    const available = ADDABLE_FILTERS.filter((f) => !activeExtra.has(f.key));
    if (available.length === 0) {
      addMenu.innerHTML = `<div class="add-filter-empty">All filters added</div>`;
      return;
    }
    const byType = new Map();
    for (const f of available) {
      if (!byType.has(f.type)) byType.set(f.type, []);
      byType.get(f.type).push(f);
    }
    addMenu.innerHTML = [...byType.entries()]
      .map(
        ([type, fields]) => `
          <div class="add-filter-group-label">${escapeHtml(TYPE_GROUP_LABELS[type] ?? type)}</div>
          ${fields
            .map((f) => `<button type="button" class="add-filter-option" role="menuitem" data-key="${f.key}">${escapeHtml(f.label)}</button>`)
            .join("")}
        `
      )
      .join("");
    addMenu.querySelectorAll(".add-filter-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        addExtraFilter(btn.dataset.key);
        renderAddMenu();
      });
    });
  }

  addBtn.addEventListener("click", () => {
    const opening = addMenu.hidden;
    if (opening) renderAddMenu();
    addMenu.hidden = !opening;
    addBtn.setAttribute("aria-expanded", String(opening));
  });
  document.addEventListener("click", (e) => {
    if (!addBtn.contains(e.target) && !addMenu.contains(e.target)) {
      addMenu.hidden = true;
      addBtn.setAttribute("aria-expanded", "false");
    }
  });
  clearBtn.addEventListener("click", clearAllFilters);

  function addExtraFilter(key) {
    if (activeExtra.has(key)) return;
    const def = ADDABLE_FILTERS.find((f) => f.key === key);
    activeExtra.add(key);

    const group = document.createElement("div");
    group.className = `filter-group filter-group--${def.type}`;

    const header = document.createElement("div");
    header.className = "filter-group-header";
    header.innerHTML = `<label>${escapeHtml(def.label)}</label><button type="button" class="remove-filter-btn" aria-label="Remove filter">&times;</button>`;
    group.appendChild(header);
    extraFiltersEl.appendChild(group);

    if (def.type === "text") {
      const body = document.createElement("div");
      body.innerHTML = `<input type="text" placeholder="Contains..." />`;
      group.appendChild(body);
      const input = body.querySelector("input");
      predicates.set(key, (row) => {
        const q = input.value.trim().toLowerCase();
        return !q || String(row[key]).toLowerCase().includes(q);
      });
      input.addEventListener("input", applyFilters);
    } else if (def.type === "checkbox") {
      const body = document.createElement("div");
      body.className = "checkbox-row";
      body.id = `rawdata-extra-${key}`;
      group.appendChild(body);
      const options = sortValues([...new Set(rows.map((r) => displayValue(r[key])))]);
      const getSelected = renderCheckboxGroup(body, options, { format: formatLabel });
      predicates.set(key, (row) => getSelected().has(displayValue(row[key])));
      body.addEventListener("change", applyFilters);
    } else if (def.type === "range") {
      const values = rows.map((r) => Number(r[key])).filter((n) => !Number.isNaN(n));
      const min = Math.min(...values);
      const max = Math.max(...values);
      const body = document.createElement("div");
      body.className = "range-row";
      body.innerHTML = `
        <input type="number" class="range-min" placeholder="Min (${min})" />
        <span>&ndash;</span>
        <input type="number" class="range-max" placeholder="Max (${max})" />
      `;
      group.appendChild(body);
      const minInput = body.querySelector(".range-min");
      const maxInput = body.querySelector(".range-max");
      predicates.set(key, (row) => {
        const val = Number(row[key]);
        const lo = minInput.value === "" ? -Infinity : Number(minInput.value);
        const hi = maxInput.value === "" ? Infinity : Number(maxInput.value);
        return val >= lo && val <= hi;
      });
      minInput.addEventListener("input", applyFilters);
      maxInput.addEventListener("input", applyFilters);
    }

    header.querySelector(".remove-filter-btn").addEventListener("click", () => {
      activeExtra.delete(key);
      predicates.delete(key);
      group.remove();
      applyFilters();
    });

    applyFilters();
  }

  applyFilters();
}
