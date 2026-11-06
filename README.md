# Flight Delay Domino Effect

An academic prototype that examines whether an aircraft's previous arrival delay and scheduled turnaround slack help predict if its next Southwest flight departs at least 15 minutes late.

## Open the frontend

Open `dashboard.html` in a browser. Keep `styles.css`, `app.js`, and `dashboard-data.js` beside it. The dashboard does not need a server or Python kernel. Select a flight leg to inspect its route, previous-arrival delay, turnaround, model prediction, actual departure, and stored turnaround what-if outputs.

## Run the analysis in VS Code

Open this folder in VS Code, select a Python kernel, and run the notebooks in order:

1. `DAY2_DATA_PREPARATION.ipynb`
2. `DAY3_EXPLORATION_AND_BASELINES.ipynb`
3. `DAY4_MODEL_REVIEW_AND_ERROR_ANALYSIS.ipynb`
4. `DAY5_SCENARIO_DEMO.ipynb`

The downloaded monthly BTS data folders must remain in the project folder for Day 2. Install dependencies in the selected environment with:

```powershell
python -m pip install -r requirements.txt
```

`DAY7_INTERACTIVE_DASHBOARD.ipynb` is an optional notebook version of the dashboard controls. Run its cells from top to bottom after installing the dependencies.

## Teacher demo sequence

1. Start with `dashboard.html` and explain the project question.
2. Select a leg and compare its predicted delay category with the actual delay. Point out the inbound arrival and scheduled turnaround that the model uses.
3. Explain the April check in plain language: the model caught about three quarters of flights delayed by 15 minutes or more.
4. Open `DAY6_REPORT_DRAFT.md` for the dataset, method, limitations, and references.

## Main results

The selected engineered Random Forest was fitted on January-March flight pairs and evaluated on 114,084 April pairs. It achieved 85.3% accuracy, 75.5% recall, 72.4% F1, and 0.887 ROC-AUC. The model's probability calibration is weak, so scores in the frontend are relative scores rather than exact probabilities.

The scenario controls use stored April model outputs after hypothetically adding 0, 15, or 30 minutes to scheduled turnaround slack. This changes one input while holding other conditions fixed. It is an illustration, not a causal estimate, a real schedule recovery recommendation, or an operationally feasible plan.

## Files

- `dashboard.html`, `styles.css`, `app.js`, `dashboard-data.js` — interactive flight-operations frontend and its locally embedded saved analysis data
- `DAY2_DATA_PREPARATION.ipynb` — data preparation and aircraft-pair construction
- `DAY3_EXPLORATION_AND_BASELINES.ipynb` — exploration, model selection, and April evaluation
- `DAY4_MODEL_REVIEW_AND_ERROR_ANALYSIS.ipynb` — calibration and error analysis
- `DAY5_SCENARIO_DEMO.ipynb` — turnaround-slack scenarios and example chain
- `DAY6_REPORT_DRAFT.md` — report draft with sources and reproducibility steps
- `PROJECT_WORKFLOW.md` — week plan and completed work
- `reports/` — saved metrics, scenario results, and figures

Data source: [BTS Reporting Carrier On-Time Performance](https://transtats.bts.gov/TableInfo.asp?QO_fu146_anzr=b0-gvzr&V0s1_b0yB=D&gnoyr_VQ=FGJ).
