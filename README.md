# Teiko: Clinical Trial Immune Cell Analysis

A tool for analyzing immune cell populations across clinical trial samples. It loads sample data into a normalized SQLite database, computes per-sample cell type frequencies, compares treatment responders against non-responders with supporting statistics, and breaks down a baseline patient subset, all surfaced through an interactive dashboard.

The dataset is 3 projects, 3,500 subjects and 10,500 samples (each subject sampled at days 0, 7 and 14), which expands to 52,500 rows in the frequency table.

## Quick start

```bash
make setup       # install dependencies
make pipeline    # build the database and write every output table and figure
make dashboard   # serve the interactive dashboard
```

`make pipeline` is fully unattended. It runs `load_data.py` (creates `teiko.db` from `cell-count.csv`) and then `generate_outputs.py`, which writes the frequency table, statistics and figure into `output/`. It is idempotent, so rerunning rebuilds the database from scratch.

Python 3.9+ and `make` are the only prerequisites.

## Dashboard

`make dashboard` starts Uvicorn on port 8000. Once it is running, open <http://localhost:8000> in a browser.

There is no separately hosted deployment. Running it locally means the dashboard always reflects the database you just built, rather than a stale copy hosted elsewhere.

Four tabs:

| Tab | What it shows |
| --- | --- |
| Overview | Part 2's frequency table, one row per sample and population, with count, percentage and sample total. |
| Responder Analysis | Part 3: boxplots of relative frequency by response, plus Mann-Whitney U results per population. |
| Baseline Subset | Part 4: the melanoma, PBMC, miraclib, day 0 cohort broken down by project, response and sex. |
| Raw Data | The full joined dataset with composable filters, and a summary statistics panel (N, mean, median, standard deviation, min, max) that recomputes over whatever the current filters select. |

The Raw Data tab answers ad-hoc questions the fixed views do not. Filtering to melanoma, male, responder, time 0 reports a mean B cell count of 10206.15 across 485 samples.

## Database schema

`cell-count.csv` is flat: one row per sample, repeating that sample's subject and project metadata on every row. The schema normalizes that into four tables.

```
projects (project_id PK, project_name UNIQUE)
    |
    +-- subjects (subject_id PK, subject_name, project_id FK,
    |             condition, age, sex, treatment, response,
    |             UNIQUE (project_id, subject_name))
            |
            +-- samples (sample_id PK, sample_name UNIQUE, subject_id FK,
                         sample_type, time_from_treatment_start)
                    |
                    +-- cell_counts (count_id PK, sample_id FK UNIQUE,
                                     b_cell, cd8_t_cell, cd4_t_cell,
                                     nk_cell, monocyte)
```

### Why this shape

**Subject attributes live in exactly one row.** In the flat CSV a patient's `response` is repeated across all three of their samples, so a partial update can leave the same patient recorded as both a responder and a non-responder. Here that value has a single authoritative home, and the contradiction is unrepresentable.

**`UNIQUE (project_id, subject_name)`, not `UNIQUE (subject_name)`.** Subject codes are only promised unique within a project. A global constraint would silently merge two different patients who happen to share a code across projects. That is a data corruption bug which produces plausible looking output rather than an error.

**Counts are separated from sample identity.** A sample exists as a fact about the trial whether or not its assay has been run, so `samples` stays insertable before `cell_counts` arrives.

**Indexes on the filter and join columns.** SQLite does not index foreign keys automatically, so joins would otherwise scan. `idx_subjects_cohort (condition, treatment, response)` covers the filter Parts 3 and 4 both open with, and `idx_samples_timepoint` covers the timepoint and sample type predicate.

### Scaling to hundreds of projects and thousands of samples

**The five populations as columns is the main thing I would revisit.** It suits a fixed five population panel and keeps the percentage computation a single row-wise operation, but adding a sixth population becomes a schema migration plus a code change in every query. At the point where panels vary between projects, `cell_counts` should become long format, `(sample_id, population, count)`, which turns "add a population" into an insert at the cost of a join and a pivot on read. I kept the wide form because the panel is fixed at exactly these five populations today.

**Move off SQLite once writes concurrently.** SQLite is single writer. That is the right call for a reproducible single user artifact like this one, and the wrong one for a shared analysis service. Postgres is the natural successor and the schema ports unchanged.

**Precompute the frequency table.** Part 2 currently recomputes all 52,500 rows per request. That is milliseconds at this size, but it is `O(samples)` work repeated on every load. At hundreds of projects it should be a materialized table refreshed on ingest, or a view backed by generated columns.

**Partition by project.** Analyses are almost always scoped to one project or a cohort within it, so project is the natural partition key and keeps working set size flat as project count grows.

**Add ingest time provenance.** With many projects arriving over time, `subjects` and `samples` want `loaded_at` and source file columns to make re-ingest idempotent and to trace a number back to the file it came from.

## Code structure

```
load_data.py          Part 1: schema and CSV load. Writes teiko.db.
analysis.py           Parts 2 to 4 query and statistics functions.
generate_outputs.py   Runs the analyses headless, writes output/.
app.py                FastAPI: JSON endpoints plus serves the frontend.
static/               Dashboard (vanilla HTML/CSS/JS, Plotly via CDN).
  js/api.js             fetch wrappers per endpoint
  js/common.js          shared render, format and stat helpers
  js/{overview,responder,baseline,rawdata}.js   one module per tab
  js/tabs.js            entry point, lazy loads and caches each tab
  css/{tokens,layout,components}.css
Makefile              setup / pipeline / dashboard
output/               Generated tables and figure (committed)
```

### Design rationale

**`analysis.py` holds the analysis and nothing else does.** The API, the file generating pipeline and the dashboard are three consumers of the same functions, so the numbers on screen and the numbers in `output/` cannot drift. `generate_outputs.py` exists precisely so the pipeline does not need a running server to produce deliverables.

**The database is the query engine.** Filtering and aggregation are SQL. pandas is used for the reshape (wide to long) and the statistics, where it is genuinely better. This keeps the analysis honest about what scales, since the joins and filters are already where they would need to be at larger data sizes.

**The frontend is plain ES modules, one per tab.** The app is four tables and two charts. A framework would add a build step and a dependency tree without removing any real complexity. Each tab module owns its own filter state and exposes one `init<Tab>(container, data)` entry point, so tabs cannot interfere with each other.

**Each tab fetches once and filters client side.** The largest payload is 10,500 rows, small enough that a round trip per filter change would be slower than filtering in memory. Filters feel instant and the server stays stateless.

**Large tables paginate.** Overview (52,500 rows) and Raw Data (10,500) render 200 rows at a time. Materializing every row as DOM was measurably the slowest thing the page did.

## Statistical notes

**Part 3 is scoped to baseline (day 0).** Each subject contributes samples at days 0, 7 and 14. Pooling all three would triple the apparent sample size and break the independence assumption Mann-Whitney U rests on, inflating significance rather than measuring it, and mixing time driven drift into what is meant to be a responder signal. One timepoint per subject keeps observations independent, and day 0 is the timepoint that matches Part 4's cohort.

**Mann-Whitney U rather than a t-test**, because relative frequencies are bounded and not assumed normal. Threshold alpha = 0.05, two sided.

**Result: no population differs significantly between responders and non-responders** at baseline in this cohort. All five p-values fall between 0.21 and 0.88 (`output/responder_stats.csv`). The boxplots show the distributions overlapping heavily, which is consistent with that. This is a real negative result, not a missing analysis.

## Outputs

`make pipeline` writes to `output/`:

| File | Part | Contents |
| --- | --- | --- |
| `frequency_table.csv` | 2 | 52,500 rows: sample, total_count, population, count, percentage |
| `responder_stats.csv` | 3 | Mann-Whitney U statistic, p-value and significance per population |
| `responder_boxplot.png` | 3 | Relative frequency by population, responder vs non-responder |
| `baseline_samples_per_project.csv` | 4 | Samples per project in the baseline cohort |
| `baseline_response_counts.csv` | 4 | Responder and non-responder subject counts |
| `baseline_sex_counts.csv` | 4 | Male and female subject counts |

The baseline cohort (melanoma, PBMC, miraclib, day 0) is 656 samples: 384 from `prj1` and 272 from `prj3`, 331 responders and 325 non-responders, 344 male and 312 female subjects.
