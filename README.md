# Flight Collision Prediction Model

## Project overview

This project studies aircraft delay propagation using historical airline on-time performance records. Its central question is whether an aircraft's previous arrival delay and the time scheduled for its turnaround help predict whether its next flight will depart at least 15 minutes late.

The project links consecutive flights by aircraft tail number, develops and evaluates chronological machine-learning baselines and candidate models, examines prediction errors and calibration, and demonstrates simplified turnaround-slack scenarios in an interactive dashboard.

Despite the repository name, this is a flight-delay analysis prototype; it does not predict physical aircraft collisions, identify new in-air routes, or provide operational dispatch recommendations.

## Objectives

- Prepare historical flight records and form time-consistent aircraft flight sequences.
- Explore how inbound delay and scheduled turnaround slack relate to the next departure delay.
- Compare baseline classifiers and select a model without using the final April holdout for tuning.
- Report classification metrics, calibration, feature importance, and error patterns.
- Demonstrate stored model results and feature-only turnaround scenarios in a local dashboard.

## Data

The primary source is the [BTS Reporting Carrier On-Time Performance dataset](https://transtats.bts.gov/TableInfo.asp?QO_fu146_anzr=b0-gvzr&V0s1_b0yB=D&gnoyr_VQ=FGJ), which contains U.S. domestic flight records.

The inspected local sample covers January-April 2026. It includes four monthly CSV extracts (2,269,061 records across carriers) and their source ZIP archives. Southwest (`WN`) accounts for 444,897 flight records; preprocessing produced 423,660 linked aircraft-flight pairs across 808 tails. See [the data inventory](documentation/data-inventory.md) for field coverage, counts, quality checks, and time-zone handling.

- `data/raw/` — locally preserved, extracted BTS CSVs.
- `data/raw/archives/` — locally preserved source ZIP archives.
- `data/processed/` — generated WN flight-level and aircraft-pair CSVs for January-March and January-April.
- `data/reference/` — airport time-zone mapping used for timestamp normalization.

Large raw and processed datasets are excluded from Git. A fresh clone therefore needs the BTS source CSVs placed in the matching `data/raw/T_ONTIME_REPORTING_<timestamp>/` folders before running preprocessing. The ZIP files may be kept under `data/raw/archives/`; the notebook reads the extracted CSVs.

## Workflow

The notebooks follow the lifecycle order below. Notebook 01 documents scope and data understanding; notebook 08 is an optional widget-based presentation.

1. [Data collection and understanding](notebooks/01_data_collection_and_understanding.ipynb) — study scope, source inventory, data quality, and preprocessing decisions.
2. [Data preprocessing](notebooks/02_data_preprocessing.ipynb) — profile BTS data, normalize airport-local timestamps, link aircraft flights, and export processed data.
3. [Exploratory data analysis](notebooks/03_exploratory_data_analysis.ipynb) — inspect delay distributions, delay rates, and propagation patterns.
4. [Baseline model development](notebooks/04_baseline_model_development.ipynb) — compare majority-class and balanced logistic-regression baselines.
5. [Model training and optimization](notebooks/05_model_training_and_optimization.ipynb) — compare engineered candidates, select a threshold on February validation, and evaluate the locked workflow on April.
6. [Model evaluation and error analysis](notebooks/06_model_evaluation_and_error_analysis.ipynb) — review calibration, feature importance, confusion matrices, and errors.
7. [Scenario simulation and demo](notebooks/07_scenario_simulation_and_demo.ipynb) — compare baseline, +15-minute, and +30-minute slack scenarios.
8. [Interactive dashboard notebook](notebooks/08_interactive_dashboard.ipynb) — optional VS Code/Jupyter widget version of the demo.

Run notebooks 02 through 07 in order after installing the dependencies. Notebooks 04 and 05 are separate so each modeling stage can be inspected and rerun independently; the required shared setup is included in each.

## Model development and evaluation

The prediction target is `DEP_DEL15`: whether the current flight's departure delay is at least 15 minutes. The primary predictors include the previous flight's arrival delay, scheduled turnaround slack, route, departure hour, weekday, and month. Tail number is used to form sequences, not as a model feature.

The notebook workflow uses a chronological design: January for initial fitting, February for model/threshold selection, March as an intermediate comparison, and April as the final holdout. Preprocessing, encoders, and imputers are fitted within model pipelines on training data.

The saved April evaluation contains 114,084 linked flight pairs with a 25.58% positive rate. The selected engineered Random Forest achieved 85.26% accuracy, 69.48% precision, 75.54% recall, 72.39% F1, and 0.887 ROC-AUC. Its probability calibration is weak; dashboard scores are relative model scores, not precise probabilities. Saved results are in `reports/metrics/`, figures in `reports/figures/`, and written analysis in `reports/analysis/`.

The +15/+30-minute scenarios change scheduled turnaround slack as a feature while holding other observed inputs fixed. They are illustrative feature perturbations, not causal estimates, operational recommendations, or validated schedule-recovery plans.

## Technologies

- Python notebooks with pandas, NumPy, scikit-learn, and Matplotlib.
- ipywidgets for the optional notebook-based dashboard demo.
- A standalone HTML, CSS, and JavaScript dashboard that displays locally embedded results.
- Python's standard-library `zoneinfo` for airport time-zone conversion.

## Dashboard

Open [dashboard/dashboard.html](dashboard/dashboard.html) directly in a browser. Keep `dashboard.html`, `styles.css`, `app.js`, and `dashboard-data.js` together in `dashboard/`. The dashboard uses its local, embedded saved analysis data and does not require a Python server or live data connection.

## Setup

Use Python 3.11 through 3.13 and install the pinned project environment:

```powershell
python -m pip install -e ".[dev]"
python -m pytest
python -m src.validate_data
```

In VS Code, select the environment as the notebook kernel. Run notebook 02 after placing the extracted monthly BTS CSVs under `data/raw/`; then run notebooks 03-07 in order. Notebook 07's final cell regenerates `dashboard/dashboard-data.js` from the scenario outputs, including deterministic demo windows for every eligible aircraft tail. Notebook 08 additionally uses `ipywidgets`. The standalone web dashboard can be opened without installing Python dependencies.

### Raw data setup

The raw BTS files and generated processed CSVs are intentionally excluded from Git because they are large datasets. A fresh clone therefore needs the local data folders prepared before preprocessing:

1. Download the January-April 2026 BTS Reporting Carrier On-Time Performance monthly extracts from the [BTS source](https://transtats.bts.gov/TableInfo.asp?QO_fu146_anzr=b0-gvzr&V0s1_b0yB=D&gnoyr_VQ=FGJ).
2. Extract each monthly download under `data/raw/`, keeping the original BTS folder and CSV names. The current download layout is documented in [data/raw/README.md](data/raw/README.md).
3. Confirm that four monthly CSV files are present, then run `python -m src.validate_data`.
4. Run [02_data_preprocessing.ipynb](notebooks/02_data_preprocessing.ipynb). It reads the raw files and writes generated flight-level and aircraft-pair CSVs under `data/processed/`.
5. Run notebooks 03–07 in order. The final dashboard export cell calls `src.dashboard_export` and writes threshold diagnostics, calibration buckets, eight sensitivity scenarios, grouped scenario summaries, and selected-flight explanations.

The tracked `data/raw/README.md` and `data/processed/.gitkeep` files preserve this directory structure in GitHub without committing the raw or generated datasets. See [data inventory](documentation/data-inventory.md) for the source coverage and expected fields.

After preprocessing, use `python -m src.validate_data --require-processed` to require the generated pair-level output as well.

## Repository structure

```text
data/
  raw/
    archives/
  processed/
  reference/
notebooks/
  01_data_collection_and_understanding.ipynb
  02_data_preprocessing.ipynb
  03_exploratory_data_analysis.ipynb
  04_baseline_model_development.ipynb
  05_model_training_and_optimization.ipynb
  06_model_evaluation_and_error_analysis.ipynb
  07_scenario_simulation_and_demo.ipynb
  08_interactive_dashboard.ipynb
dashboard/
src/
  data/
  features/
  models/
  visualization/
reports/
  figures/
  metrics/
  analysis/
documentation/
requirements.txt
README.md
```

Reusable timestamp, target, pairing, scenario, configuration, and validation code lives under `src/`; notebooks use these helpers where the workflow is shared. Automated regression tests live under `tests/`.

## Documentation

- [Project workflow](documentation/project-workflow.md)
- [Data inventory](documentation/data-inventory.md)
- [Project guidelines](documentation/project-guidelines.md)
- [Technical documentation](documentation/technical-documentation.md)
- [Project report draft](reports/analysis/project_report_draft.md)
