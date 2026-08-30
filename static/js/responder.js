import { formatInt, formatLabel, renderMetrics, renderTable, sortRows } from "./common.js";

export function initResponder(container, data) {
  const { comparison, stats } = data;

  const nResp = new Set(
    comparison.filter((r) => r.response === "yes").map((r) => r.sample)
  ).size;
  const nNonResp = new Set(
    comparison.filter((r) => r.response === "no").map((r) => r.sample)
  ).size;
  const nSig = stats.filter((s) => s.significant === "Yes").length;

  container.innerHTML = `
    <div id="responder-metrics"></div>
    <div class="section-header">Population Frequencies: Responders vs Non-Responders</div>
    <p class="caption">Melanoma patients &middot; Miraclib treatment &middot; PBMC samples, baseline &middot; Mann-Whitney U test (&alpha; = 0.05)</p>
    <div id="responder-boxplot" style="height:480px;"></div>
    <div class="section-header">Statistical Test Results</div>
    <div id="responder-stats-table"></div>
  `;

  renderMetrics(container.querySelector("#responder-metrics"), [
    { value: nResp, label: "Responder Samples" },
    { value: nNonResp, label: "Non-Responder Samples" },
    { value: `${nSig} / ${stats.length}`, label: "Significant Populations" },
  ]);

  const traces = [
    // Colorblind-safe pair, deliberately distinct from
    // --color-primary/--color-success: a teal/green pair reads as nearly
    // identical on the red-green confusion axis, whereas blue vs. amber stays
    // distinguishable under all common color vision deficiencies.
    { key: "yes", name: "Responder", color: "#1d4ed8" },
    { key: "no", name: "Non-Responder", color: "#b45309" },
  ].map(({ key, name, color }) => {
    const subset = comparison.filter((r) => r.response === key);
    return {
      type: "box",
      name,
      x: subset.map((r) => formatLabel(r.population)),
      y: subset.map((r) => r.percentage),
      marker: { color },
      boxpoints: false,
    };
  });

  Plotly.newPlot(
    container.querySelector("#responder-boxplot"),
    traces,
    {
      boxmode: "group",
      font: { family: "Inter, sans-serif", size: 13, color: "#1e293b" },
      plot_bgcolor: "rgba(0,0,0,0)",
      paper_bgcolor: "rgba(0,0,0,0)",
      legend: {
        orientation: "h",
        y: 1.1,
        x: 0.5,
        xanchor: "center",
        font: { size: 13, color: "#475569" },
      },
      margin: { l: 50, r: 20, t: 30, b: 60 },
      xaxis: {
        title: "Cell Population",
        showgrid: false,
        tickfont: { size: 12, color: "#475569" },
        titlefont: { size: 13, color: "#475569" },
      },
      yaxis: {
        title: "Relative Frequency (%)",
        gridcolor: "rgba(30,41,59,0.1)",
        zerolinecolor: "rgba(30,41,59,0.15)",
        tickfont: { size: 12, color: "#475569" },
        titlefont: { size: 13, color: "#475569" },
      },
      boxgap: 0.3,
      boxgroupgap: 0.15,
    },
    { responsive: true, displayModeBar: false }
  );

  const columns = [
    { key: "population", label: "Population", sortable: true, render: (r) => formatLabel(r.population) },
    { key: "u_statistic", label: "U Statistic", sortable: true, render: (r) => r.u_statistic.toFixed(2) },
    { key: "p_value", label: "p-value", sortable: true, render: (r) => r.p_value.toFixed(6) },
    {
      key: "significant",
      label: "Significant",
      sortable: true,
      render: (r) =>
        `<span class="badge ${r.significant === "Yes" ? "badge-yes" : "badge-no"}">${r.significant}</span>`,
    },
  ];

  const statsTableEl = container.querySelector("#responder-stats-table");
  let sortState = null;

  function renderStatsTable() {
    const displayStats = sortState ? sortRows(stats, sortState.key, sortState.direction) : stats;
    renderTable(statsTableEl, columns, displayStats, {
      sortState,
      onSort: (key) => {
        sortState = { key, direction: sortState?.key === key && sortState.direction === "asc" ? "desc" : "asc" };
        renderStatsTable();
      },
    });
  }

  renderStatsTable();
}
