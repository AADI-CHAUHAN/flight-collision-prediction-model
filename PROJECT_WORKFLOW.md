# The Flight Delay Domino Effect

## One-week project workflow

**Project question:** When an aircraft arrives late, can we identify its next flight as being at risk of a significant departure delay? How much might additional turnaround slack reduce the simulated delay spillover?

**Project type:** A historical-data analysis, predictive model, and transparent schedule simulation. This is a student prototype, not an airline operations system or a source of live operational instructions.

## 1. Project summary

Airline delays can carry from one flight to the next when the same aircraft operates both flights. This project will use public flight records to link consecutive flights by aircraft tail number, measure how often an incoming delay is followed by a late departure, and predict whether the next flight will depart at least 15 minutes late. A small what-if simulator will compare observed turnaround slack with scenarios that add 15 or 30 minutes of recovery slack.

The project does **not** find new in-air flight paths or prove that changing a schedule would cause a specific improvement. It examines airport-to-airport flight sequences and tests simplified scenarios against historical records.

## 2. What the finished prototype should do

Given a selected flight or aircraft sequence, the prototype should:

1. Show the flight route and scheduled/actual times.
2. Identify the next flight in the same aircraft sequence when the data supports a reliable link.
3. Estimate the probability that the next flight departs at least 15 minutes late.
4. Explain the estimate using a small number of readable factors, such as incoming arrival delay and scheduled turnaround slack.
5. Show a timeline of the observed sequence and compare it with transparent +15-minute and +30-minute recovery-slack scenarios.
6. Summarize model performance and the limits of the simulation.

## 3. Dataset and project scope

### Primary dataset

Use the U.S. Bureau of Transportation Statistics (BTS) **Reporting Carrier On-Time Performance** flight-level data:

- [BTS dataset description and field catalog](https://transtats.bts.gov/TableInfo.asp?QO_fu146_anzr=b0-gvzr&V0s1_b0yB=D&gnoyr_VQ=FGJ)
- [BTS On-Time Statistics download page](https://transtats.bts.gov/ONTIME/)

BTS describes the table as monthly records of domestic non-stop flights. It includes routes, scheduled and actual departure/arrival times, cancellations, diversions, taxi times, delay causes, air time, and distance. The table has many more fields than this project needs, so download only a few months and retain a focused subset.

### Recommended scope

- Use **Southwest Airlines (BTS carrier code WN)** across its network for **January–April 2026**. The uploaded sample contains the most flight records for WN, and keeping one carrier makes aircraft sequences easier to interpret while retaining the carrier's network preserves tail-number links across airports. See [DAY1_SCOPE_AND_DATA_INVENTORY.md](DAY1_SCOPE_AND_DATA_INVENTORY.md) for the verified counts.
- Include all airports operated by that airline during the chosen period, then select a few interesting aircraft sequences for the demonstration.
- Start with completed flights that have usable tail numbers. Analyze cancellations separately because cancelled flights may not have an assigned tail number or an ordinary arrival record.
- Do not begin with all carriers or many years. Expand only if the first data slice is clean and the schedule permits.

### Core fields to retain

Field labels can vary slightly by BTS download/table version. Keep the corresponding fields for:

| Purpose | BTS fields / concepts |
|---|---|
| Flight identity | Flight date, reporting/operating carrier, flight number |
| Route | Origin airport, destination airport, distance |
| Aircraft linkage | Tail number |
| Schedule | Scheduled departure and arrival times |
| Actual operation | Actual gate departure and arrival, wheels-off/on if useful |
| Outcome | Departure delay, arrival delay, cancellation, diversion |
| Explanatory context | Day of week, scheduled elapsed time, taxi-out/in, delay-cause minutes |

Delay-cause fields are not always populated. Do not require them for the main model. Do not use actual next-flight departure delay, actual arrival time, or delay-cause information from the target flight as model inputs; those would reveal the answer.

### Optional supporting data

Airport time zones are important because BTS reports times in local airport time. Use a reputable airport-code-to-time-zone lookup or a standard time-zone database to convert events to comparable timestamps before ordering tail-number sequences. Record the lookup source in the report. If this becomes a blocker, use a smaller, clearly documented subset of aircraft sequences that can be ordered reliably; do not silently compare local clock times across time zones.

## 4. Definitions and target

- **Aircraft sequence:** flights with the same tail number, ordered by actual event time after resolving airport time zones.
- **Turnaround slack:** scheduled departure of the next flight minus scheduled arrival of the previous flight. Negative or implausible values should be flagged for review.
- **Incoming arrival delay:** actual arrival time of the previous flight minus its scheduled arrival time, in minutes.
- **Late next departure (main target):** next flight's departure delay is **15 minutes or more**. BTS commonly defines an on-time arrival as less than 15 minutes after schedule; document the chosen threshold and apply it consistently.
- **Delay spillover:** an association where a late incoming flight is followed by a late departure of the same aircraft. Association alone does not prove causation.

Exclude records with missing tail number, impossible time order, unresolved date rollover, or unusable target values from the core aircraft-link model. Report how many records are excluded and why.

## 5. Questions and hypotheses

1. How often is a late arrival followed by a late departure on the same aircraft?
2. Does the risk of a late next departure increase as incoming delay grows?
3. Does the amount of scheduled turnaround slack help identify flights that recover versus flights that remain delayed?
4. In a transparent scenario that adds recovery slack, how much simulated delay remains in a chain?

Treat these as questions to test, not expected conclusions.

## 6. Modeling plan

### Baselines

Build a simple majority-class baseline, then a logistic-regression classifier. These establish whether a more complex model adds value.

### Main model

Use a Random Forest classifier to predict whether the next flight departs at least 15 minutes late. Suitable input features known at the point of prediction include:

- Previous flight's arrival delay and whether it was cancelled/diverted, where a valid next-flight link exists.
- Scheduled turnaround slack.
- Current flight's carrier, origin/destination, departure hour, day of week, and month.
- Optional recent airport activity proxy calculated from BTS records (for example, number of scheduled departures in the previous hour), if time permits.

Use categorical encoding and handle missing values explicitly. Do not feed tail number itself into the model as a predictive feature; use it to build the flight sequence. Avoid features that are only known after the next flight operates.

### Train/test split

Split by time, not randomly: train on earlier dates, validate on a later period, and reserve the latest period for final evaluation. This better reflects prediction on future flights and reduces leakage between adjacent records. Keep every aircraft chain's chronology intact.

### Evaluation

Report:

- Precision, recall, F1, and confusion matrix for the late-departure class.
- ROC-AUC if both classes appear in the test set and class balance makes it informative.
- Baseline versus logistic regression versus Random Forest.
- Class prevalence and dataset size after filtering.

Accuracy alone is not enough, especially if most flights are not delayed. Explain the tradeoff between missing a risky flight and flagging flights that leave on time.

## 7. What-if schedule simulation

The simulator is a **simplified scenario analysis**, not a causal estimate or recommended airline action.

For each usable aircraft sequence, calculate a baseline risk/estimated delay outcome. Then test two scenarios that increase the turnaround-slack feature by 15 and 30 minutes, respectively, and run the same trained model. Show the change in predicted at-risk flights and predicted risk. Label the results as model-based scenarios and state that changing one flight's schedule can affect later schedules in ways the public data cannot represent.

As a transparent cross-check, include a simple rule-based propagation calculation. For example, under the stated assumption that added slack can absorb incoming delay minute-for-minute, residual delay at a turn is `max(0, incoming delay - added slack)`. Make clear that this is a toy assumption, not observed operational performance. Do not claim that the scenario proves adding buffer would prevent those delays.

If the counterfactual feature changes look unreliable or the model behaves implausibly, keep the observed propagation analysis and present the buffer calculation as an illustrative rule-based demonstration only.

## 8. Dashboard / presentation

A small Streamlit app, notebook dashboard, or static report is enough. Include:

1. **Overview:** study dates, airline, flight count, data-filtering summary, and late-flight rate.
2. **Aircraft chain:** a timeline showing previous arrival, turnaround slack, next scheduled departure, and actual departure.
3. **Risk estimate:** low/medium/high or a probability, with the key inputs shown beside it.
4. **What-if panel:** observed baseline versus +15 and +30 minutes of simulated recovery slack.
5. **Model evaluation:** baseline and model scores plus a confusion matrix.
6. **Limitations:** historical U.S. domestic data; not real-time; not all flights have usable tail numbers; simplified scenarios; no crew, gate, passenger, maintenance, runway-slot, or live weather availability.

## 9. One-week schedule

### Day 1 — Confirm the data and narrow the scope

- **Completed:** downloaded and inspected BTS data for January–April 2026.
- **Completed:** selected Southwest (WN) for the pilot based on its high flight count and complete tail-number coverage among non-cancelled flights.
- **Completed:** documented the dataset, selected fields, scope, target, data-quality checks, and time-zone plan in [DAY1_SCOPE_AND_DATA_INVENTORY.md](DAY1_SCOPE_AND_DATA_INVENTORY.md).
- Deliverable: verified raw CSVs, source notes, and locked scope.

### Day 2 — Clean and link flight sequences

- **Completed:** added reproducible preprocessing in `DAY2_DATA_PREPARATION.ipynb`, profiled the raw WN data (shape, all-column dtypes, numeric/categorical split, descriptive statistics, and missing counts/percentages), and filtered four monthly files (January-April 2026) to WN. The April file has 17 core fields while January-March have 23; optional fields absent from April are handled without imputing them as observed values.
- **Completed:** mapped all 107 WN airport codes to IANA time zones, including STS added for April, converted local times to UTC, handled `2400` and arrival date rollover, and derived the `DEP_DEL15` target.
- **Completed:** excluded cancelled, diverted, missing-tail, and unusable-time records from the operated-aircraft sequences; retained cancellations in the flight-level output for separate analysis.
- **Completed:** linked 423,660 adjacent-flight pairs by aircraft tail and matching destination/origin airport, after requiring plausible scheduled and actual turnaround intervals of 0–24 hours. Cancelled/diverted events with a reported departure are kept as sequence barriers so links do not jump over them.
- **Completed:** summarized the 5,969 WN cancellations by month and cancellation code in `reports/day2_cancellation_summary.csv` for separate disruption analysis.
- **Completed:** inspected ten sample chains; route handoffs and turn intervals were coherent in the inspected examples.
- Deliverables: `DAY2_DATA_PREPARATION.ipynb`, `reports/day2_raw_dataset_profile.json`, `reports/day2_raw_column_profile.csv`, `reports/day2_raw_descriptive_statistics.csv`, `data/processed/wn_flights_2026-01_to_2026-04.csv`, `data/processed/wn_aircraft_pairs_2026-01_to_2026-04.csv`, `reports/day2_data_quality.json`, `reports/day2_cancellation_summary.csv`, and `reports/day2_sample_chains.md`.

### Day 3 — Explore and establish baselines

- **Completed:** created `DAY3_EXPLORATION_AND_BASELINES.ipynb` with delay distributions and rates by scheduled hour, weekday, and origin airport, plus next-flight delay analysis by inbound arrival delay and scheduled turnaround slack.
- **Completed:** made a chronological January-February training / March comparison split. Median imputation, scaling, and one-hot encoding are inside a model pipeline fitted only on training data; current-flight actual delay and actual timestamps are excluded from predictors to prevent target leakage. April is now the fresh final holdout.
- **Completed:** compared a training-majority baseline with balanced logistic regression using accuracy, precision, recall, F1, ROC-AUC, average precision, and a confusion matrix.
- **Completed:** added a controlled improvement round: fit candidate models on January, selected features/model/threshold on February validation, then refit the winner on January-February. Engineered features include log delay/slack, a short-slack indicator and interaction, and cyclical departure-hour values; compared original and engineered logistic regression with a Random Forest.
- **March comparison:** the February-selected engineered Random Forest scored 0.8479 accuracy, 0.7586 precision, 0.7285 recall, 0.7433 F1, 0.8777 ROC-AUC, and 0.8272 average precision. March was already viewed during baseline analysis, so it is not the fresh final test.
- **Fresh April final evaluation:** the selected Random Forest was refit on January-March and scored 0.8526 accuracy, 0.6948 precision, 0.7554 recall, 0.7239 F1, 0.8870 ROC-AUC, and 0.8178 average precision on April. April's 15+ minute delay rate was 25.58%. Do not tune further on April.
- **Finding to carry into Day 4:** delay prevalence is 19.63% in January-February, 30.22% in March, and 25.58% in April; present month-specific rates and confusion matrices alongside overall metrics.
- Deliverables: `DAY3_EXPLORATION_AND_BASELINES.ipynb`, `reports/day3_figures/`, `reports/day3_baseline_metrics.csv`, `reports/day3_logistic_confusion_matrix.csv`, `reports/day3_model_validation_comparison.csv`, `reports/day3_model_improvement_march_metrics.csv`, `reports/day3_selected_model_march_confusion_matrix.csv`, `reports/day3_model_improvement_summary.json`, `reports/day3_april_final_metrics.csv`, `reports/day3_april_final_confusion_matrix.csv`, `reports/day3_april_final_summary.json`, `reports/day3_delay_quantiles.csv`, and `reports/day3_run_summary.json`.

### Day 4 — Validate the selected model and inspect errors

- **Completed:** created `DAY4_MODEL_REVIEW_AND_ERROR_ANALYSIS.ipynb`; reproduced the locked February-selected Random Forest and 0.4988 threshold, fit on January-March, and reviewed April without tuning on it.
- **Completed:** checked calibration on February validation and April. February ECE is 0.2027; the model's absolute risk probabilities are poorly calibrated, so present them as relative scores rather than precise risk percentages.
- **Completed:** summarized grouped feature importance and reviewed April confusion matrix, false negatives/false positives, example aircraft chains, and error rates by inbound delay and scheduled slack.
- **Finding:** previous-flight arrival delay and its interaction with short scheduled slack account for most of the Random Forest's grouped impurity importance. This is predictive association, not causal evidence.
- Deliverables: `DAY4_MODEL_REVIEW_AND_ERROR_ANALYSIS.ipynb`, `reports/day4_error_analysis.md`, `reports/day4_run_summary.json`, `reports/day4_calibration_metrics.csv`, `reports/day4_calibration_bins.csv`, `reports/day4_random_forest_grouped_importance.csv`, `reports/day4_april_confusion_matrix.csv`, `reports/day4_april_error_examples.csv`, `reports/day4_april_errors_by_inbound_delay.csv`, `reports/day4_april_errors_by_slack.csv`, and `reports/day4_figures/`.

### Day 5 — Build the propagation and scenario demo

- **Completed:** created `DAY5_SCENARIO_DEMO.ipynb`, which compares the locked model and a simple residual-inbound-delay rule under baseline, +15-minute, and +30-minute scheduled-slack scenarios for April flight pairs.
- **Completed:** added an illustrative aircraft-chain timeline showing observed arrival/departure events and hypothetical scheduled-departure shifts.
- **Completed:** documented assumptions and limitations, including that the model scores are uncalibrated, the intervention is feature-only, and the demo does not model downstream schedules, crews, runway capacity, or causal operational effects.
- **Scenario summary:** average relative model score changes from 0.4233 at baseline to 0.3922 with +15 minutes and 0.3586 with +30 minutes. The transparent rule flags 2.87%, 1.80%, and 1.20% of flights delayed, respectively. These are illustrative associations, not expected real-world savings.
- Deliverables: `DAY5_SCENARIO_DEMO.ipynb`, `reports/day5_scenario_notes.md`, `reports/day5_run_summary.json`, `reports/day5_scenario_impact_summary.csv`, `reports/day5_demo_chain_scenarios.csv`, and `reports/day5_figures/`.

### Day 6 — Explain the evidence

- **Completed:** created `DAY6_REPORT_DRAFT.md` with the project question, BTS data and preparation, features, chronological evaluation design, April holdout metrics, error/calibration interpretation, scenario results, limitations, references, and notebook run order.
- **Completed:** cross-checked the headline April metrics, February/April calibration errors, and +15/+30-minute scenario figures against the saved CSV outputs under `reports/`.
- **Completed:** reviewed the sample aircraft chains (UTC labels, routes, scheduled slack, actual turn, and observed delays) and documented airport-local-to-UTC conversion and the `2400` rollover handling.
- **Key conclusion:** the selected Random Forest separates delayed from non-delayed flights better than the baselines, but its scores are poorly calibrated and the slack scenarios are feature-only illustrations. They do not establish causal savings or operationally feasible schedule changes.
- Deliverable: `DAY6_REPORT_DRAFT.md`, with reproducible notebook steps and source links. A presentation and final rehearsal remain for Day 7.

### Day 7 — Finalize and rehearse

- **Completed:** refined the standalone frontend into five compact sections using `dashboard.html`, `styles.css`, `app.js`, and `dashboard-data.js`. It includes the stored aircraft chain, selectable flight legs, combined selected-flight and delay-intelligence view, April scatter sample, expandable feature importance, stored turnaround what-if outputs, and holdout metrics with confusion matrix. It opens directly in a browser without a Python server.
- **Completed:** created `DAY7_INTERACTIVE_DASHBOARD.ipynb` as a notebook-based alternative for presenting the same saved scenario outputs inside VS Code. Added `ipywidgets` to `requirements.txt` for its controls.
- **Completed:** added a concise project README with setup instructions, the recommended teacher demo sequence, and links to the report and analysis notebooks.
- **Final presentation claim:** results apply to the selected Southwest sample and the April holdout. The dashboard predicts a delay category and does not give exact delay minutes or operational recommendations. Detailed scenario analysis remains in the Day 5 notebook.
- Deliverables: `dashboard.html`, `styles.css`, `app.js`, `dashboard-data.js`, `DAY7_INTERACTIVE_DASHBOARD.ipynb`, `README.md`, `DAY6_REPORT_DRAFT.md`, and the analysis notebooks with saved evaluation outputs.

## 10. Week-one fallback plan

If tail-number chains or time-zone ordering prove too difficult by the end of Day 2:

1. Keep the same project question but analyze **airport-level delay propagation by time window** rather than aircraft-level propagation.
2. Predict whether a flight departs 15+ minutes late from schedule, carrier, route, hour, day, and recent airport delay/congestion features.
3. Present the turnaround-buffer scenario only as a rule-based toy simulation, not a learned model result.

If data download or compute is too large, use one carrier and one or two months first. Do not switch to all 109 columns or train on the full BTS history during this one-week version.

## 11. Risks and safeguards

- **Time-zone and date rollover errors:** use airport time zones and validate sequences manually.
- **Missing tail numbers:** report coverage and restrict aircraft-chain claims to linked records.
- **Target leakage:** only use information available before the next flight departs.
- **Class imbalance:** report precision/recall/F1 and a baseline, not accuracy alone.
- **Counterfactual overclaim:** distinguish observed association, model prediction, and simplified simulation.
- **Data scope:** results apply to the selected U.S. carrier and dates, not all airlines or Indian operations.

## 12. Final project claim template

> Using BTS historical flight data for **[carrier]** during **[dates]**, we linked **[N]** consecutive-flight pairs with usable aircraft identifiers. We tested whether incoming aircraft delay and scheduled turnaround slack help identify next-flight departure delays of 15 minutes or more. We compared **[baseline]** with **[model]** using a chronological test split and used a simplified scenario to explore added turnaround slack. The results describe this historical sample and do not establish that schedule changes would cause the simulated improvement.

