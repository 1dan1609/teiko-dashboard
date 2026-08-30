"""
Writes the Parts 2 to 4 deliverables to output/ as files.

The dashboard renders these same analyses interactively. This script produces
them on disk without starting a server, reusing the same functions in
analysis.py that back the API so the two cannot diverge.

Run directly: python generate_outputs.py (expects teiko.db to already exist)
"""

import os
import sqlite3

import matplotlib

# Selected before pyplot is imported: the pipeline runs headless, where the
# default interactive backend has no display to attach to and would fail on
# import.
matplotlib.use("Agg")

import matplotlib.pyplot as plt

import analysis

DB_PATH = "teiko.db"
OUTPUT_DIR = "output"

RESPONSE_COLORS = {"yes": "#1d4ed8", "no": "#b45309"}
RESPONSE_LABELS = {"yes": "Responder", "no": "Non-responder"}


def write_boxplot(comparison, path):
    """
    Part 3's figure: per-population responder vs non-responder relative
    frequencies, drawn as side-by-side boxes sharing one population axis.

    Mirrors the dashboard's chart, including its blue/amber pair, chosen so
    the two series stay distinguishable under the common forms of colour
    blindness, where a teal/green pair does not.
    """
    populations = analysis.POPULATIONS
    fig, ax = plt.subplots(figsize=(11, 6))

    for offset, response in ((-0.19, "yes"), (0.19, "no")):
        series = [
            comparison[
                (comparison["population"] == pop) & (comparison["response"] == response)
            ]["percentage"].to_numpy()
            for pop in populations
        ]
        color = RESPONSE_COLORS[response]
        ax.boxplot(
            series,
            positions=[i + offset for i in range(len(populations))],
            widths=0.32,
            patch_artist=True,
            boxprops={"facecolor": color, "alpha": 0.55, "edgecolor": color},
            medianprops={"color": color, "linewidth": 2},
            whiskerprops={"color": color},
            capprops={"color": color},
            flierprops={"markeredgecolor": color, "markersize": 4},
        )

    ax.set_xticks(range(len(populations)))
    ax.set_xticklabels([analysis.format_population(p) for p in populations])
    ax.set_xlim(-0.6, len(populations) - 0.4)
    ax.set_ylabel("Relative frequency (%)")
    ax.set_title(
        "Baseline PBMC relative frequencies, melanoma patients on miraclib",
        pad=14,
    )
    ax.yaxis.grid(True, alpha=0.25)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)

    # Proxy handles: boxplot() draws no artist a legend can label directly.
    ax.legend(
        handles=[
            plt.Rectangle((0, 0), 1, 1, facecolor=RESPONSE_COLORS[r], alpha=0.55, label=RESPONSE_LABELS[r])
            for r in ("yes", "no")
        ],
        frameon=False,
    )

    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def main():
    if not os.path.exists(DB_PATH):
        raise SystemExit(f"{DB_PATH} not found. Run `python load_data.py` first.")

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)

    def out(name):
        return os.path.join(OUTPUT_DIR, name)

    written = []

    frequencies = analysis.get_frequency_table(conn)
    frequencies.to_csv(out("frequency_table.csv"), index=False)
    written.append(("frequency_table.csv", f"{len(frequencies)} rows"))

    comparison, response_stats = analysis.get_responder_comparison(conn)
    response_stats.to_csv(out("responder_stats.csv"), index=False)
    written.append(("responder_stats.csv", f"{len(response_stats)} populations tested"))

    write_boxplot(comparison, out("responder_boxplot.png"))
    written.append(("responder_boxplot.png", f"{comparison['sample'].nunique()} samples plotted"))

    per_project, per_response, per_sex = analysis.get_baseline_analysis(conn)
    for filename, frame in (
        ("baseline_samples_per_project.csv", per_project),
        ("baseline_response_counts.csv", per_response),
        ("baseline_sex_counts.csv", per_sex),
    ):
        frame.to_csv(out(filename), index=False)
        written.append((filename, f"{len(frame)} rows"))

    conn.close()

    print(f"Wrote {len(written)} files to {OUTPUT_DIR}/:")
    for filename, detail in written:
        print(f"  {filename:<38} {detail}")

    significant = response_stats[response_stats["significant"] == "Yes"]["population"]
    print(
        "\nPart 3 result: "
        + (
            f"significant at a=0.05 -> {', '.join(significant)}"
            if len(significant)
            else "no population differs significantly at a=0.05"
        )
    )


if __name__ == "__main__":
    main()
