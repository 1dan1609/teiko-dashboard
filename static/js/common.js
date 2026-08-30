const ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

export function formatInt(n) {
  return Number(n).toLocaleString();
}

const KNOWN_ABBREVIATIONS = { cd4: "CD4", cd8: "CD8", nk: "NK", pbmc: "PBMC", wb: "WB" };

/**
 * Humanizes a snake_case domain term (e.g. population names) for display,
 * preserving standard immunology abbreviations (CD4, CD8, NK) instead of
 * naively title-casing them into "Cd4"/"Nk".
 */
export function formatLabel(value) {
  return String(value)
    .split("_")
    .map((word) => KNOWN_ABBREVIATIONS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Sorts a list of raw (string) values, comparing numerically when every
 * value looks like a number (e.g. "0", "7", "14") and lexicographically
 * otherwise, so numeric option lists don't end up ordered as "0, 14, 7".
 */
export function sortValues(values) {
  const allNumeric = values.every((v) => v !== "" && !Number.isNaN(Number(v)));
  return [...values].sort((a, b) =>
    allNumeric ? Number(a) - Number(b) : String(a).localeCompare(String(b))
  );
}

/**
 * Renders a row of checkboxes (all checked by default) into `container` and
 * returns a getSelected() function reading the currently-checked values.
 * Caller is responsible for attaching a "change" listener on `container`.
 * `format` maps a raw value to its display text (default: shown as-is). The
 * checkbox's underlying value and filtering behavior always use the raw value;
 * only the visible label changes.
 */
export function renderCheckboxGroup(container, values, { format = (v) => v } = {}) {
  container.innerHTML = values
    .map(
      (v, i) => `
        <label class="checkbox-label">
          <input type="checkbox" value="${escapeHtml(v)}" id="${container.id}-${i}" checked />
          ${escapeHtml(format(v))}
        </label>
      `
    )
    .join("");

  return () =>
    new Set(
      [...container.querySelectorAll("input[type=checkbox]:checked")].map((cb) => cb.value)
    );
}

/**
 * Sorts a copy of `rows` by `row[key]`, numerically when both sides are
 * numbers and lexicographically otherwise. `direction` is "asc" or "desc".
 */
export function sortRows(rows, key, direction) {
  const sign = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
    return String(av).localeCompare(String(bv)) * sign;
  });
}

/**
 * Summarizes the numeric spread of each column in `columns` over `rows`,
 * returning one result row per column (not per data row).
 *
 * Blank/non-numeric cells are dropped per-column rather than per-row, so a
 * sparse column still reports over the values it does have, which is why
 * `n` is reported per column instead of once for the whole table.
 *
 * `stdDev` is the sample standard deviation (n-1 denominator, since these
 * rows are a filtered subset rather than the whole population); it is null
 * below n=2, where that denominator is undefined rather than zero.
 */
export function computeColumnStats(rows, columns) {
  return columns.map(({ key, label }) => {
    // Blanks are rejected before Number() rather than after: Number(null)
    // and Number("") are both 0, so a post-hoc isFinite check would silently
    // fold every missing cell into the mean as a real zero.
    const values = rows
      .filter((row) => row[key] !== null && row[key] !== undefined && row[key] !== "")
      .map((row) => Number(row[key]))
      .filter((v) => Number.isFinite(v))
      // Sorting once serves the median and both extremes.
      .sort((a, b) => a - b);

    const n = values.length;
    if (n === 0) {
      return { column: label, n, mean: null, median: null, stdDev: null, min: null, max: null };
    }

    const mean = values.reduce((sum, v) => sum + v, 0) / n;
    const mid = n >> 1;

    return {
      column: label,
      n,
      mean,
      median: n % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2,
      stdDev:
        n < 2
          ? null
          : Math.sqrt(values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1)),
      min: values[0],
      max: values[n - 1],
    };
  });
}

export function renderMetrics(container, metrics) {
  container.innerHTML = `<div class="metric-row">${metrics
    .map(
      (m) =>
        `<div class="metric-card"><div class="value">${escapeHtml(m.value)}</div><div class="label">${escapeHtml(m.label)}</div></div>`
    )
    .join("")}</div>`;
}

// Opt-in per column; an omitted `align` leaves the cell at the table default.
const alignClass = (c) => (c.align ? ` class="cell-${c.align}"` : "");

function headerCellHtml(c, sortState) {
  if (!c.sortable) return `<th${alignClass(c)}>${escapeHtml(c.label)}</th>`;
  const active = sortState && sortState.key === c.key;
  const arrow = active ? (sortState.direction === "desc" ? " ▼" : " ▲") : "";
  return `<th${alignClass(c)}><button type="button" class="sort-th-btn" data-sort-key="${escapeHtml(c.key)}">${escapeHtml(c.label)}${arrow}</button></th>`;
}

function tableHtml(columns, rows, sortState) {
  const thead = `<tr>${columns.map((c) => headerCellHtml(c, sortState)).join("")}</tr>`;
  const tbody = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((c) => `<td${alignClass(c)}>${c.render ? c.render(row) : escapeHtml(row[c.key])}</td>`)
          .join("")}</tr>`
    )
    .join("");
  return `<div class="table-scroll"><table class="data-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
}

function wireSortButtons(container, onSort) {
  if (!onSort) return;
  container.querySelectorAll(".sort-th-btn").forEach((btn) => {
    btn.addEventListener("click", () => onSort(btn.dataset.sortKey));
  });
}

/**
 * columns: [{ key, label, sortable?, render?(row) => htmlString }]
 * A column without `render` is escaped automatically; a `render` result is
 * inserted as-is (used for badges etc.) so callers must escape it themselves.
 * A `sortable` column renders a clickable header; pass `sortState` ({key,
 * direction}) to show the current arrow and `onSort(key)` to receive clicks.
 * The caller owns actually sorting `rows` (see `sortRows`) and re-calling.
 *
 * Use for small tables only (roughly under 1,000 rows), since it renders every
 * row's DOM at once. For large datasets use renderPaginatedTable instead,
 * since rendering tens of thousands of rows in one innerHTML pass is what
 * makes the page slow to interact with.
 */
export function renderTable(container, columns, rows, { sortState, onSort } = {}) {
  container.innerHTML = tableHtml(columns, rows, sortState);
  wireSortButtons(container, onSort);
}

/**
 * Renders a message in place of a table when a filter/search matches no rows,
 * with an optional recovery action. This distinguishes "no data exists" from
 * "the tool is broken", which is genuinely ambiguous when the only feedback is
 * "Showing 0 of N rows".
 */
function renderEmptyState(container, emptyMessage, onClear) {
  const clearBtn = onClear
    ? `<button type="button" class="empty-state-clear-btn">Clear filters</button>`
    : "";
  container.innerHTML = `
    <div class="empty-state">
      <p>${escapeHtml(emptyMessage)}</p>
      ${clearBtn}
    </div>
  `;
  if (onClear) {
    container.querySelector(".empty-state-clear-btn").addEventListener("click", onClear);
  }
}

/**
 * Same column/row contract as renderTable, but only materializes one page
 * of rows' DOM at a time (default 200/page) with Prev/Next controls, so
 * filtering a 10k-50k row dataset stays responsive.
 *
 * `emptyMessage`/`onClear` control what renders when `rows` is empty,
 * instead of a bare header-only table.
 */
export function renderPaginatedTable(
  container,
  columns,
  rows,
  { pageSize = 200, emptyMessage = "No rows match your filters.", onClear, sortState, onSort } = {}
) {
  if (rows.length === 0) {
    renderEmptyState(container, emptyMessage, onClear);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  let page = 0;

  function goToPage(target) {
    page = Math.min(Math.max(0, target - 1), totalPages - 1);
    renderPage();
  }

  function renderPage() {
    const start = page * pageSize;
    const pageRows = rows.slice(start, start + pageSize);
    const pager = `
      <div class="pager">
        <button type="button" class="pager-btn" data-action="prev" ${page === 0 ? "disabled" : ""}>Prev</button>
        <span class="pager-status">Page</span>
        <input type="number" class="pager-page-input" min="1" max="${totalPages}" value="${page + 1}" />
        <span class="pager-status">of ${totalPages}</span>
        <button type="button" class="pager-btn" data-action="next" ${page >= totalPages - 1 ? "disabled" : ""}>Next</button>
      </div>
    `;
    container.innerHTML = tableHtml(columns, pageRows, sortState) + pager;
    wireSortButtons(container, onSort);

    container.querySelector('[data-action="prev"]')?.addEventListener("click", () => {
      if (page > 0) {
        page -= 1;
        renderPage();
      }
    });
    container.querySelector('[data-action="next"]')?.addEventListener("click", () => {
      if (page < totalPages - 1) {
        page += 1;
        renderPage();
      }
    });

    const pageInput = container.querySelector(".pager-page-input");
    pageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") goToPage(parseInt(e.target.value, 10) || 1);
    });
    pageInput.addEventListener("change", (e) => {
      goToPage(parseInt(e.target.value, 10) || 1);
    });
  }

  renderPage();
}
