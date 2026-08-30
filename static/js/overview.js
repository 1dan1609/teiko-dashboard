import { formatInt, formatLabel, renderCheckboxGroup, renderMetrics, renderPaginatedTable, sortRows } from "./common.js";

export function initOverview(container, data) {
  const { rows, populations } = data;

  const sampleTotals = new Map();
  for (const row of rows) {
    if (!sampleTotals.has(row.sample)) sampleTotals.set(row.sample, row.total_count);
  }
  const nSamples = sampleTotals.size;
  const avgTotal = Math.round(
    [...sampleTotals.values()].reduce((a, b) => a + b, 0) / nSamples
  );

  container.innerHTML = `
    <div id="overview-metrics"></div>
    <div class="section-header">Cell Population Frequency Table</div>
    <div class="filters-row">
      <div class="filter-group">
        <label>Filter by population</label>
        <div class="checkbox-row" id="overview-pop-filter"></div>
      </div>
    </div>
    <div class="filters-row">
      <div class="filter-group filter-group--search">
        <label for="overview-sample-search">Search by sample ID</label>
        <div class="search-row">
          <input type="text" id="overview-sample-search" placeholder="e.g. sample00112 or 112" />
          <button type="button" id="overview-search-btn" class="search-btn">Search</button>
        </div>
      </div>
    </div>
    <div id="overview-table"></div>
    <p class="caption" id="overview-caption" aria-live="polite"></p>
  `;

  renderMetrics(container.querySelector("#overview-metrics"), [
    { value: formatInt(nSamples), label: "Samples" },
    { value: populations.length, label: "Populations" },
    { value: formatInt(avgTotal), label: "Avg Total Cells" },
  ]);

  const popFilterEl = container.querySelector("#overview-pop-filter");
  // Display label only (the checkbox picker, not the required data column
  // below) is humanized for readability; filtering still matches the raw
  // population value.
  const getSelectedPopulations = renderCheckboxGroup(popFilterEl, populations, { format: formatLabel });

  const searchInput = container.querySelector("#overview-sample-search");
  const searchBtn = container.querySelector("#overview-search-btn");
  const tableEl = container.querySelector("#overview-table");
  const captionEl = container.querySelector("#overview-caption");

  // The spec requires this table's `population` cell to show the literal
  // value (e.g. "b_cell"), so it stays raw here even though the filter
  // checkboxes above are humanized for readability.
  const columns = [
    { key: "sample", label: "Sample", sortable: true },
    { key: "population", label: "Population", sortable: true },
    { key: "count", label: "Count", sortable: true, render: (r) => formatInt(r.count) },
    { key: "percentage", label: "Percentage (%)", sortable: true, render: (r) => r.percentage.toFixed(2) },
    {
      key: "total_count",
      label: "Total Count",
      sortable: true,
      render: (r) => `<span class="muted-cell">${formatInt(r.total_count)}</span>`,
    },
  ];

  // Only committed on Search (button click / Enter), not on every keystroke.
  let committedQuery = "";
  let sortState = null;

  function clearAllFilters() {
    popFilterEl.querySelectorAll("input[type=checkbox]").forEach((cb) => (cb.checked = true));
    searchInput.value = "";
    committedQuery = "";
    applyFilters();
  }

  function applyFilters() {
    const selected = getSelectedPopulations();

    let filtered = rows.filter((row) => {
      if (!selected.has(row.population)) return false;
      if (committedQuery && row.sample.toLowerCase() !== committedQuery) return false;
      return true;
    });

    if (sortState) filtered = sortRows(filtered, sortState.key, sortState.direction);

    renderPaginatedTable(tableEl, columns, filtered, {
      emptyMessage: committedQuery
        ? `No sample matches "${searchInput.value.trim()}".`
        : "No rows match the selected populations.",
      onClear: clearAllFilters,
      sortState,
      onSort: (key) => {
        sortState = { key, direction: sortState?.key === key && sortState.direction === "asc" ? "desc" : "asc" };
        applyFilters();
      },
    });
    captionEl.textContent = `Showing ${formatInt(filtered.length)} of ${formatInt(rows.length)} rows`;
  }

  function runSearch() {
    let query = searchInput.value.trim().toLowerCase();
    if (/^\d+$/.test(query)) {
      query = `sample${query.padStart(5, "0")}`;
    }
    committedQuery = query;
    applyFilters();
  }

  popFilterEl.addEventListener("change", applyFilters);
  searchBtn.addEventListener("click", runSearch);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch();
  });

  applyFilters();
}
