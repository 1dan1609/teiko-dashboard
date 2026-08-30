"""
Analysis functions for Parts 2 to 4.

  - get_frequency_table(): relative frequency of each cell population per sample
  - get_responder_comparison(): statistical comparison of responders vs non-responders
  - get_baseline_analysis(): baseline subset breakdown
"""

import pandas as pd
from scipy import stats

POPULATIONS = ["b_cell", "cd8_t_cell", "cd4_t_cell", "nk_cell", "monocyte"]
SIGNIFICANCE_THRESHOLD = 0.05

# Immunology abbreviations that a naive .title() would mangle into "Cd4"/"Nk".
_ABBREVIATIONS = {"cd4": "CD4", "cd8": "CD8", "nk": "NK"}


def format_population(name):
    """Renders a population key for axis labels and figure text."""
    return " ".join(_ABBREVIATIONS.get(word, word.capitalize()) for word in name.split("_"))


def get_frequency_table(conn):
    """
    Part 2: Compute relative frequency of each cell population per sample.

    Returns a DataFrame with columns:
        sample, total_count, population, count, percentage
    One row per (sample, population), so 5 rows per sample.
    """
    query = """
        SELECT
            s.sample_name AS sample,
            cc.b_cell,
            cc.cd8_t_cell,
            cc.cd4_t_cell,
            cc.nk_cell,
            cc.monocyte
        FROM samples s
        JOIN cell_counts cc ON s.sample_id = cc.sample_id
    """
    df = pd.read_sql_query(query, conn)

    # Compute total cell count per sample
    df["total_count"] = df[POPULATIONS].sum(axis=1)

    # Melt to long format: one row per (sample, population)
    melted = df.melt(
        id_vars=["sample", "total_count"],
        value_vars=POPULATIONS,
        var_name="population",
        value_name="count",
    )

    # Compute percentage
    melted["percentage"] = (melted["count"] / melted["total_count"] * 100).round(2)

    return melted[["sample", "total_count", "population", "count", "percentage"]]


def get_responder_comparison(conn):
    """
    Part 3: Compare cell population frequencies between responders and non-responders.

    Filters: melanoma + miraclib + PBMC + baseline (time_from_treatment_start = 0)
    + response in (yes, no)

    Scoped to baseline only: subjects in this cohort have multiple follow-up
    samples (days 0/7/14), and Mann-Whitney U requires independent
    observations. Including all timepoints would count each subject up to 3x,
    both inflating N and mixing time-driven drift into the responder signal.

    Returns:
        comparison_df: long-format DataFrame with columns
            (sample, response, population, percentage) for boxplots
        stats_df: DataFrame with columns
            (population, u_statistic, p_value, significant) for the stats table
    """
    query = """
        SELECT
            s.sample_name AS sample,
            sub.response,
            cc.b_cell,
            cc.cd8_t_cell,
            cc.cd4_t_cell,
            cc.nk_cell,
            cc.monocyte
        FROM samples s
        JOIN subjects sub ON s.subject_id = sub.subject_id
        JOIN cell_counts cc ON s.sample_id = cc.sample_id
        WHERE sub.condition = 'melanoma'
          AND sub.treatment = 'miraclib'
          AND s.sample_type = 'PBMC'
          AND s.time_from_treatment_start = 0
          AND sub.response IN ('yes', 'no')
    """
    df = pd.read_sql_query(query, conn)

    # Compute total and percentages
    df["total_count"] = df[POPULATIONS].sum(axis=1)

    melted = df.melt(
        id_vars=["sample", "response", "total_count"],
        value_vars=POPULATIONS,
        var_name="population",
        value_name="count",
    )
    melted["percentage"] = (melted["count"] / melted["total_count"] * 100).round(2)

    comparison_df = melted[["sample", "response", "population", "percentage"]]

    # Run Mann-Whitney U test for each population
    stats_results = []
    for pop in POPULATIONS:
        pop_data = melted[melted["population"] == pop]
        responders = pop_data[pop_data["response"] == "yes"]["percentage"]
        non_responders = pop_data[pop_data["response"] == "no"]["percentage"]

        u_stat, p_val = stats.mannwhitneyu(
            responders, non_responders, alternative="two-sided"
        )

        stats_results.append(
            {
                "population": pop,
                "u_statistic": round(u_stat, 2),
                "p_value": round(p_val, 6),
                "significant": "Yes" if p_val < SIGNIFICANCE_THRESHOLD else "No",
            }
        )

    stats_df = pd.DataFrame(stats_results)

    return comparison_df, stats_df


def get_baseline_analysis(conn):
    """
    Part 4: Baseline subset analysis for melanoma + PBMC + miraclib + time=0.

    Returns:
        samples_per_project: DataFrame (project, sample_count)
        response_counts: DataFrame (response, subject_count)
        sex_counts: DataFrame (sex, subject_count)
    """
    base_filter = """
        FROM samples s
        JOIN subjects sub ON s.subject_id = sub.subject_id
        JOIN projects p ON sub.project_id = p.project_id
        WHERE sub.condition = 'melanoma'
          AND s.sample_type = 'PBMC'
          AND s.time_from_treatment_start = 0
          AND sub.treatment = 'miraclib'
    """

    # Query 1: How many samples from each project
    q1 = f"""
        SELECT p.project_name AS project, COUNT(*) AS sample_count
        {base_filter}
        GROUP BY p.project_name
        ORDER BY p.project_name
    """
    samples_per_project = pd.read_sql_query(q1, conn)

    # Query 2: How many subjects were responders/non-responders
    # (excludes subjects with a missing/null response, consistent with Part 3)
    q2 = f"""
        SELECT sub.response, COUNT(DISTINCT sub.subject_id) AS subject_count
        {base_filter}
          AND sub.response IN ('yes', 'no')
        GROUP BY sub.response
        ORDER BY sub.response
    """
    response_counts = pd.read_sql_query(q2, conn)

    # Query 3: How many subjects were males/females
    q3 = f"""
        SELECT sub.sex, COUNT(DISTINCT sub.subject_id) AS subject_count
        {base_filter}
        GROUP BY sub.sex
        ORDER BY sub.sex
    """
    sex_counts = pd.read_sql_query(q3, conn)

    return samples_per_project, response_counts, sex_counts
