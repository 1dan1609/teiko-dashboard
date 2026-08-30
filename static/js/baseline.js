import { formatInt, renderMetrics, renderTable } from "./common.js";

function renderBarChart(container, labels, values) {
  Plotly.newPlot(
    container,
    [
      {
        type: "bar",
        x: values,
        y: labels,
        orientation: "h",
        marker: { color: "#0f766e" },
        text: values.map(formatInt),
        textposition: "outside",
        cliponaxis: false,
      },
    ],
    {
      font: { family: "Inter, sans-serif", size: 12, color: "#1e293b" },
      plot_bgcolor: "rgba(0,0,0,0)",
      paper_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 90, r: 30, t: 6, b: 24 },
      xaxis: { showgrid: false, showticklabels: false, zeroline: false },
      yaxis: { showgrid: false, tickfont: { size: 12, color: "#1e293b" } },
      showlegend: false,
    },
    { responsive: true, displayModeBar: false, staticPlot: true }
  );
}

export function initBaseline(container, data) {
  const { samples_per_project, response_counts, sex_counts } = data;

  const totalBaseline = samples_per_project.reduce((a, r) => a + r.sample_count, 0);
  const totalSubjects = response_counts.reduce((a, r) => a + r.subject_count, 0);

  container.innerHTML = `
    <div id="baseline-metrics"></div>
    <p class="caption">Melanoma patients &middot; Miraclib treatment &middot; PBMC samples &middot; Baseline (time = 0)</p>
    <div class="grid-3">
      <div class="subset-card">
        <h4>Samples per Project</h4>
        <div id="baseline-project-chart" style="height:110px;"></div>
        <div id="baseline-project"></div>
      </div>
      <div class="subset-card">
        <h4>Response Breakdown</h4>
        <div id="baseline-response-chart" style="height:110px;"></div>
        <div id="baseline-response"></div>
      </div>
      <div class="subset-card">
        <h4>Sex Breakdown</h4>
        <div id="baseline-sex-chart" style="height:110px;"></div>
        <div id="baseline-sex"></div>
      </div>
    </div>
  `;

  renderMetrics(container.querySelector("#baseline-metrics"), [
    { value: formatInt(totalBaseline), label: "Baseline Samples" },
    { value: formatInt(totalSubjects), label: "Unique Subjects" },
  ]);

  renderBarChart(
    container.querySelector("#baseline-project-chart"),
    samples_per_project.map((r) => r.project),
    samples_per_project.map((r) => r.sample_count)
  );
  renderTable(
    container.querySelector("#baseline-project"),
    [
      { key: "project", label: "Project" },
      { key: "sample_count", label: "Samples" },
    ],
    samples_per_project
  );

  const respLabel = { yes: "Responder", no: "Non-Responder" };
  renderBarChart(
    container.querySelector("#baseline-response-chart"),
    response_counts.map((r) => respLabel[r.response] ?? r.response),
    response_counts.map((r) => r.subject_count)
  );
  renderTable(
    container.querySelector("#baseline-response"),
    [
      { key: "response", label: "Response", render: (r) => respLabel[r.response] ?? r.response },
      { key: "subject_count", label: "Subjects" },
    ],
    response_counts
  );

  const sexLabel = { M: "Male", F: "Female" };
  renderBarChart(
    container.querySelector("#baseline-sex-chart"),
    sex_counts.map((r) => sexLabel[r.sex] ?? r.sex),
    sex_counts.map((r) => r.subject_count)
  );
  renderTable(
    container.querySelector("#baseline-sex"),
    [
      { key: "sex", label: "Sex", render: (r) => sexLabel[r.sex] ?? r.sex },
      { key: "subject_count", label: "Subjects" },
    ],
    sex_counts
  );
}
