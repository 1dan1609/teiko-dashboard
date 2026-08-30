"""
FastAPI backend for the dashboard.

Serves JSON from analysis.py over teiko.db, and the static HTML/CSS/JS
frontend in static/.

Run: uvicorn app:app --reload
"""

import sqlite3

import pandas as pd
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

import analysis

DB_PATH = "teiko.db"

RAW_DATA_QUERY = """
    SELECT
        p.project_name AS project,
        sub.subject_name AS subject,
        sub.condition,
        sub.age,
        sub.sex,
        sub.treatment,
        sub.response,
        s.sample_name AS sample,
        s.sample_type,
        s.time_from_treatment_start,
        cc.b_cell,
        cc.cd8_t_cell,
        cc.cd4_t_cell,
        cc.nk_cell,
        cc.monocyte
    FROM samples s
    JOIN subjects sub ON s.subject_id = sub.subject_id
    JOIN projects p ON sub.project_id = p.project_id
    JOIN cell_counts cc ON s.sample_id = cc.sample_id
    ORDER BY s.sample_name
"""

app = FastAPI(title="Teiko Clinical Trial Analysis")
conn = sqlite3.connect(DB_PATH, check_same_thread=False)


def records(df: pd.DataFrame):
    """DataFrame -> JSON-safe list of dicts (NaN -> None)."""
    return df.where(pd.notnull(df), None).to_dict(orient="records")


@app.get("/api/overview")
def api_overview():
    df = analysis.get_frequency_table(conn)
    return {
        "rows": records(df),
        "populations": sorted(df["population"].unique().tolist()),
    }


@app.get("/api/responder-comparison")
def api_responder_comparison():
    comparison_df, stats_df = analysis.get_responder_comparison(conn)
    return {
        "comparison": records(comparison_df),
        "stats": records(stats_df),
    }


@app.get("/api/baseline-subset")
def api_baseline_subset():
    samples_per_project, response_counts, sex_counts = analysis.get_baseline_analysis(conn)
    return {
        "samples_per_project": records(samples_per_project),
        "response_counts": records(response_counts),
        "sex_counts": records(sex_counts),
    }


@app.get("/api/raw-data")
def api_raw_data():
    df = pd.read_sql_query(RAW_DATA_QUERY, conn)
    return {"rows": records(df)}


# Mounted last: falls back to serving static/index.html and static/{css,js}/*
# for any path not matched by an /api/* route above.
app.mount("/", StaticFiles(directory="static", html=True), name="static")
