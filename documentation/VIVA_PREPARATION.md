# Viva Preparation: Flight Delay Domino Effect

## Repository-inspection status

This guide is based only on the checked repository, saved reports, notebooks, source code, visualizations, and dashboard.

**Verified implementation**
- The project does **not** predict physical aircraft collisions.
- It predicts whether a Southwest flight's next departure will be at least 15 minutes late.
- It studies consecutive Southwest flights operated by the same aircraft tail.
- It uses chronological January-February selection, January-March training, and April final holdout data.
- The selected model is an engineered Random Forest.
- The standalone dashboard loads stored/exported data; it does not call a live model or flight API.

**Verified test status**
- `tests/test_preprocessing.py` and `tests/test_scenarios.py`: **8 tests passed**.

# Chapter 1: Project Introduction

## 1.1 Project title and objective

**Working title:** *The Flight Delay Domino Effect*.

The research question is:

> When a Southwest aircraft arrives late, can we predict whether its next operated flight will depart at least 15 minutes late, and how does a simplified increase in scheduled turnaround slack affect the stored model score?

The prediction unit is one aircraft-flight pair:

```text
previous flight (inbound) -> turnaround -> current/next flight
```

The binary target is `DEP_DEL15`:

- `1`: `DEP_DELAY >= 15`
- `0`: `DEP_DELAY < 15`

For example, if the previous flight arrives 45 minutes late and the next flight departs 20 minutes late, the target row is `1`.

## 1.2 Why this problem matters

A delay can consume time on an aircraft's next leg, especially when scheduled turnaround slack is small. Airlines have limited crews, gates, aircraft, and recovery time. An early-warning prototype can help demonstrate where propagation risk may be highest, but this project is not an operational dispatch tool.

## 1.3 Scope

**Implemented:** data collection/quality review, UTC conversion, aircraft pairing, EDA, baseline and candidate models, chronological evaluation, calibration/error analysis, feature perturbation scenarios, and a dashboard.

**Not implemented:** real-time flight feeds, physical collision prediction, runway/gate/crew scheduling, a causality study, schedule optimization, or a validated operational recommendation.

## 1.4 1-minute introduction

“My project is titled The Flight Delay Domino Effect. We study whether delay propagation can be predicted using historical Southwest Airlines flight data. The model links consecutive flights operated by the same aircraft tail. The target is whether the next flight departs at least 15 minutes late. We use the previous arrival delay, scheduled turnaround slack, route, departure hour, and day of week. The project uses chronological evaluation: January and February for development and selection, January through March for final training, and April as a fresh holdout. Our selected engineered Random Forest achieved 85.26 percent accuracy and 75.54 percent recall on April. The dashboard demonstrates the results and simplified turnaround scenarios, but it does not provide operational recommendations.”

## 1.5 3-minute introduction

“The project investigates aircraft delay propagation using BTS Reporting Carrier On-Time Performance data. A flight is not analyzed in isolation. We first link consecutive flights operated by the same aircraft tail and require matching airport handoffs, valid times, and a realistic turnaround interval. The target is a binary variable that indicates whether the next flight departed at least 15 minutes late.

The main predictors are previous-flight arrival delay and scheduled turnaround slack. We also use origin, destination, departure hour, and weekday, plus engineered log, short-slack, interaction, and cyclical-hour features. Cancelled and diverted flights remain in the flight-level quality reports but are excluded from the primary operated-flight pairs.

We built a chronological model-development workflow. January-March candidates were compared with February used for threshold/model selection. The selected engineered Random Forest was retrained on January-March and tested on April, which was never used for tuning. On 114,084 April pairs, it achieved 85.26 percent accuracy, 69.48 percent precision, 75.54 percent recall, 72.39 percent F1, and 0.887 ROC-AUC.

The project also performs calibration and error analysis. Its probability output is weakly calibrated, so we describe the output as a relative model score rather than a precise probability. The +15 and +30 minute scenario work is feature-only what-if analysis. It does not prove that changing a schedule would cause delay reduction.

Finally, there is a standalone HTML/CSS/JavaScript dashboard for demonstrating flight chains, model performance, filters, sensitivity analysis, and explainability.”

# Chapter 2: Dataset Understanding

## 2.1 Source

The primary source is the BTS Reporting Carrier On-Time Performance table. The repository contains four January-April 2026 extracted monthly CSVs and original ZIP archives.

**Raw source size**
- January: 544,003 all-carrier rows.
- February: 515,037 all-carrier rows.
- March: 612,102 all-carrier rows.
- April: 597,919 all-carrier rows.
- Combined: 2,269,061 all-carrier rows.

Filtering to Southwest (`OP_UNIQUE_CARRIER == "WN"`) produced 444,897 flight records.

## 2.2 Important columns

| Column | Meaning |
|---|---|
| `YEAR`, `MONTH`, `DAY_OF_MONTH` | Flight date components. |
| `OP_UNIQUE_CARRIER` | Carrier code; study carrier is `WN`. |
| `TAIL_NUM` | Aircraft identifier used to connect legs. |
| `OP_CARRIER_FL_NUM` | Flight number. |
| `ORIGIN`, `DEST` | IATA airport codes. |
| `CRS_DEP_TIME` | Scheduled local departure clock, represented as HHMM. |
| `DEP_TIME` | Actual local departure clock. |
| `DEP_DELAY` | Current-flight departure delay in minutes. |
| `ARR_DELAY_NEW` | Previous/current arrival delay in minutes; early values are generally represented as zero. |
| `CRS_ARR_TIME` | Scheduled local arrival clock. |
| `ARR_TIME` | Actual local arrival clock. |
| `CANCELLED` | 1 for a cancelled flight. |
| `DIVERTED` | 1 for a diverted flight. |
| `TAIL_NUM` | Not used as a model predictor, only used to construct sequences. |

April is a 17-core-column download, while January-March contain 23 selected fields. Optional precomputed flags such as `DEP_DELAY_NEW` and `ARR_DEL15` are not required because the project derives `DEP_DEL15` from `DEP_DELAY`.

## 2.3 Processed outputs

- `data/processed/wn_flights_2026-01_to_2026-04.csv`: 444,897 flight-level WN records.
- `data/processed/wn_aircraft_pairs_2026-01_to_2026-04.csv`: 423,660 valid linked pairs across 808 tails.
- `data/reference/airport_timezones.csv`: 107 IANA airport mappings.

## 2.4 Data quality

Verified quality counts:
- 726 missing tail numbers in the WN flight file.
- 5,969 cancelled flights.
- 798 diverted flights.
- 11,952 missing/unresolved timestamp values across scheduled and actual UTC fields.
- 0 unknown airport timezone mappings.
- 438,130 candidate aircraft pairs.
- 423,660 linked pairs.
- 14,470 candidate pairs rejected.
- 0 invalid turnaround values among retained pairs.

No exact duplicate rows were found in the monthly review. Missing actual times were not imputed because their absence can represent cancellations/diversions or incomplete reporting.

# Chapter 3: Data Preprocessing

Implementation: [src/preprocessing.py](/C:/Users/Aditi%20Chauhan/Documents/ChatGPT/flight%20collision%20prediction%20model/src/preprocessing.py) and notebook [02_data_preprocessing.ipynb](/C:/Users/Aditi%20Chauhan/Documents/ChatGPT/flight%20collision%20prediction%20model/notebooks/02_data_preprocessing.ipynb).

## 3.1 Load and filter

The notebook loads the four extracted CSV files, normalizes older/newer BTS header names, validates required columns, and filters to `OP_UNIQUE_CARRIER == "WN"`.

If it did not filter, other carriers would contaminate the tail and route counts and the model would not represent Southwest consistently.

## 3.2 Date and HHMM conversion

The date is formed from `YEAR`, `MONTH`, and `DAY_OF_MONTH`.

The function `parse_clock()` parses a BTS HHMM value:
- `1234` becomes 12:34.
- `2400` becomes 00:00 on the next day.
- invalid values such as `1260` return `None`.

The reference table maps airport codes to IANA zones. `to_utc()` converts airport-local wall time to UTC using `zoneinfo`.

Example:

```text
Flight date: 2026-01-01
Scheduled local departure: 23:30
Airport timezone: America/New_York
Arrival clock: 00:30
Arrival UTC is first placed on 2026-01-02 and must be 0–30 hours after departure.
```

## 3.3 DST handling

For a non-existent local time during spring-forward, `to_utc()` shifts it forward to a valid local time. For ambiguous fall-back times, it uses the earlier deterministic candidate (`fold=0`). If this is skipped, departure/arrival values across time zones can be ordered incorrectly.

## 3.4 Flight-level cleaning

The notebook strips tail-number whitespace and converts blank, `"nan"`, and `"None"` values to missing. It retains cancelled/diverted records in the flight-level table.

Missing delay or timestamp fields remain missing in flight-level data and are excluded only when pairing or model training requires a usable value.

## 3.5 Target creation

`create_target()` adds:

```text
DEP_DEL15 = 1 if DEP_DELAY >= 15 else 0
```

Thus 14 minutes is `0`, 15 minutes is `1`, and 30 minutes is `1`.

## 3.6 Aircraft sequence construction

For every tail, records are sorted by:
1. `TAIL_NUM`
2. actual departure UTC
3. flight date
4. flight number

Cancelled/diverted events with reported actual departures remain in the event stream as barriers. The pipeline creates previous-flight fields using `groupby("TAIL_NUM").shift(1)`.

## 3.7 Pair validity rules

Both flights must be operated; previous and current required arrival/departure values must exist. The previous destination must equal the current origin. Scheduled and actual turnarounds must be between 0 and 24 hours.

Scheduled slack:

```text
scheduled slack = current scheduled departure UTC
                  - previous scheduled arrival UTC
```

Actual turnaround:

```text
actual turnaround = current actual departure UTC
                    - previous actual arrival UTC
```

Example:

```text
Previous scheduled arrival: 18:00
Current scheduled departure: 18:45
Scheduled turnaround slack: 45 minutes
Previous actual arrival: 18:30
Current actual departure: 19:15
Actual turnaround: 45 minutes
```

## 3.8 Train-test split

The chronological splits are:
- January fit/initial baseline period.
- February validation/threshold selection.
- January-February or January-March refit.
- March intermediate comparison.
- April fresh holdout.

The final evaluation fit is January-March, 309,576 rows. April test size is 114,084 rows.

No future month is used to fit preprocessing or select the model threshold in the final locked workflow.

# Chapter 4: Exploratory Data Analysis

Notebook: [03_exploratory_data_analysis.ipynb](/C:/Users/Aditi%20Chauhan/Documents/ChatGPT/flight%20collision%20prediction%20model/notebooks/03_exploratory_data_analysis.ipynb).

## 4.1 Delay distributions

Figure: [delay_distributions.png](/C:/Users/Aditi%20Chauhan/Documents/ChatGPT/flight%20collision%20prediction%20model/reports/figures/delay_distributions.png).

The first histogram shows previous-arrival delay on the x-axis and pair count on the y-axis. The second shows current-departure delay on the x-axis and pair count on the y-axis. The display is capped for readability, not the underlying quantile report.

Across 423,660 pairs:
- Previous arrival mean: 10.96 minutes; median: 0.
- Current departure mean: 9.94 minutes; median: 0.
- 95th percentile previous delay: 57 minutes.
- 95th percentile current delay: 57 minutes.

This shows a heavily concentrated distribution near zero with a long tail.

## 4.2 Schedule and origin context

Figure: [delay_rates_by_schedule_and_origin.png](/C:/Users/Aditi%20Chauhan/Documents/ChatGPT/flight%20collision%20prediction%20model/reports/figures/delay_rates_by_schedule_and_origin.png).

The graph separates scheduled departure hour, weekday, and origin. Each bar/line's y-axis is the percentage of pairs with `DEP_DEL15 = 1`. It identifies associations, not causation.

## 4.3 Inbound delay and next-flight delay

Figure: [propagation_by_inbound_delay_and_slack.png](/C:/Users/Aditi%20Chauhan/Documents/ChatGPT/flight%20collision%20prediction%20model/reports/figures/propagation_by_inbound_delay_and_slack.png).

Actual saved propagation rates:

| Previous arrival-delay band | Flight pairs | Next-flight delayed rate |
|---|---:|---:|
| <=0 min | 263,027 | 9.12% |
| 1-15 | 78,367 | 32.16% |
| 16-30 | 35197 | 60.26% |
| 31-60 | 27,443 | 68.77% |
| 61-120 | 14,119 | 65.97% |
| >120 | 5,507 | 63.66% |

There is a strong rise from on-time/early inbound flights to moderately late inbound flights, with a slight flattening at very large inbound delays.

## 4.4 Scheduled slack

Saved slack-band rates:

| Scheduled slack | Next-flight delayed rate |
|---|---:|
| 0-15 min | 84.34% |
| 16-30 min | 57.58% |
| 31-60 min | 28.31% |
| 61-90 min | 18.30% |
| 361-720 min | 5.91% |

This pattern supports the use of short turnaround slack as a risk feature. The relationship is observational, not proof of causation.

# Chapter 5: Feature Engineering

Implementation: [src/features.py](/C:/Users/Aditi%20Chauhan/Documents/ChatGPT/flight%20collision%20prediction%20model/src/features.py).

## 5.1 Original model features

The baseline and initial logistic model use:
- `PREV_ARR_DELAY_MIN`
- `SCHEDULED_TURNAROUND_SLACK_MIN`
- `ORIGIN`
- `DEST`
- `DEPARTURE_HOUR_LOCAL`
- `DAY_OF_WEEK`

## 5.2 Engineered numeric features

### Log1p previous arrival delay

```text
PREV_ARR_DELAY_LOG1P = ln(1 + max(previous arrival delay, 0))
```

It compresses extreme values. Example: 30 minutes becomes `ln(31) = 3.434`.

### Log1p scheduled slack

```text
SCHEDULED_SLACK_LOG1P = ln(1 + max(scheduled slack, 0))
```

### Short turnaround indicator

```text
SHORT_SLACK_LT_60 = 1 if scheduled slack < 60, otherwise 0
```

For 45 minutes: `1`. For 180 minutes: `0`.

### Previous-delay × short-slack interaction

```text
PREV_DELAY_X_SHORT_SLACK
= PREV_ARR_DELAY_LOG1P * SHORT_SLACK_LT_60
```

It asks whether the effect of inbound delay is different when turnaround slack is under 60 minutes.

Example:
- Previous delay 30 minutes.
- Slack 45 minutes.
- Log delay `ln(31)=3.434`.
- Short flag `1`.
- Interaction `3.434`.

### Cyclical hour features

```text
DEPARTURE_HOUR_SIN = sin(2π × hour / 24)
DEPARTURE_HOUR_COS = cos(2π × hour / 24)
```

This prevents hour 23 and hour 0 from appearing far apart numerically. For 6 AM, sine is approximately `1`.

## 5.3 Engineered categorical features

- `ORIGIN`
- `DEST`
- `DAY_OF_WEEK`

The month feature appears in scope notes and candidate data, but the verified engineered feature list used in the selected model does not include `MONTH`. Do not claim in the viva that month was selected as a model feature.

# Chapter 6: Machine Learning Models

## 6.1 Supervised binary classification

Supervised learning provides input-label pairs. The input features describe a pair of flights, and the label is `DEP_DEL15`.

Classification predicts a category; here there are two categories.

The target:
- `1`: 15 or more minutes late.
- `0`: under 15 minutes late.

## 6.2 Majority baseline

`DummyClassifier(strategy="most_frequent")` predicts the largest training class every time.

It establishes that an accuracy score must be compared with a naive rule. It has no learned relationship and always has 0 precision/recall for the minority positive class.

## 6.3 Balanced logistic regression

Logistic regression estimates a probability-like score for a binary outcome. It uses a linear combination of transformed inputs followed by a sigmoid function.

Implementation:
- Median imputer for numeric fields.
- Most-frequent imputer for categorical fields.
- Standard scaling for numeric fields.
- One-hot encoding for airport categories.
- `class_weight="balanced"`.
- `max_iter=500`.
- `solver="liblinear"`.

Advantages: interpretable coefficients, fast training, less complex. Limitation: assumes mostly additive linear relationships.

## 6.4 Engineered balanced logistic regression

It uses the log, short-slack, interaction, and cyclical-hour engineered features.

## 6.5 Engineered Random Forest

The final model is a pipeline containing median imputation, one-hot encoding, and `RandomForestClassifier`.

Settings:
- 120 trees.
- Maximum depth 14.
- Minimum 40 samples per leaf.
- `max_features="sqrt"`.
- `class_weight="balanced_subsample"`.
- `n_jobs=-1`.
- `random_state=42`.

The forest combines many decision trees trained on subsamples. Random feature selection decorates/varies the trees, and leaf probabilities are aggregated.

Advantages: captures nonlinear relationships and interactions. Limitations: weaker native probability calibration, harder to interpret, can be sensitive to tuning.

## 6.6 Chronological model selection

February candidate metrics:

| Model | F1 | Selected threshold | Accuracy | Precision | Recall | ROC-AUC |
|---|---:|---:|---:|---:|---:|---:|
| Engineered Random Forest | 0.6914 | 0.4987978 | 0.8643 | 0.6920 | 0.6908 | 0.8656 |
| Engineered logistic | 0.6863 | 0.6861 | 0.8698 | 0.7307 | 0.6470 | 0.8620 |
| Original logistic | 0.6142 | 0.5877 | 0.8373 | 0.6421 | 0.5886 | 0.6221 |
| Majority baseline | 0.0000 | 0.5000 | 0.7799 | 0.0000 | 0.0000 | 0.5000 |

The Random Forest was selected by February validation F1, and the threshold was locked before April.

# Chapter 7: Model Evaluation

## 7.1 April holdout

Rows: 114,084. Positive rate: 25.58%.

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC | Average precision |
|---|---:|---:|---:|---:|---:|---:|
| Majority baseline | 74.42% | 0.00% | 0.00% | 0.00% | 0.500 | 0.2558 |
| Balanced logistic | 78.59% | 56.11% | 74.88% | 64.15% | 0.8487 | 0.6989 |
| Engineered Random Forest | **85.26%** | **69.48%** | **75.54%** | **72.39%** | **0.8870** | **0.8178** |

## 7.2 Confusion matrix

|  | Predicted under 15 | Predicted 15+ |
|---|---:|---:|
| Actual under 15 | 75,221 (TN) | 9,683 (FP) |
| Actual 15+ | 7,136 (FN) | 22,044 (TP) |

Totals:
- Total: 114,084.
- Actual positive: 29,180.
- Predicted positive: 31,727.
- Actual negative: 84,904.

## 7.3 Accuracy

```text
Accuracy = (TP + TN) / (TP + TN + FP + FN)
         = (22044 + 75221) / 114084
         = 85.26%
```

It measures all correct classifications, but it can be dominated by negative examples.

## 7.4 Precision

```text
Precision = TP / (TP + FP)
          = 22044 / (22044 + 9683)
          = 69.48%
```

When the model predicts delay, it is correct in about 69.48% of cases.

## 7.5 Recall

```text
Recall = TP / (TP + FN)
       = 22044 / (22044 + 7136)
       = 75.54%
```

The model catches about 75.54% of actual 15+ minute delays.

## 7.6 F1

```text
F1 = 2 × Precision × Recall / (Precision + Recall)
   = 72.39%
```

F1 balances precision and recall. It was the February model/threshold selection metric.

## 7.7 ROC-AUC

ROC-AUC measures ranking ability across thresholds. 0.887 means the model generally gives delayed flights a higher score than under-15-minute flights. A 0.5 score is random ranking. It is not the same as accuracy.

## 7.8 Average precision

Average precision summarizes the precision-recall curve. The April result is 0.8178.

## 7.9 Calibration

The Brier score is mean squared error between the stored score and actual binary outcome. Lower is better.

- February Brier: 0.1416.
- April Brier: 0.1332.
- February ECE: 0.2027.
- April ECE: 0.1832.

ECE is the weighted observed-versus-predicted gap across risk buckets.

The dashboard and reports call the result a relative model score, not a precise probability.

# Chapter 8: Error Analysis

File: [day4_error_analysis.md](/C:/Users/Aditi%20Chauhan/Documents/ChatGPT/flight%20collision%20prediction%20model/reports/analysis/day4_error_analysis.md).

## 8.1 False negatives

A false negative is an actual 15+ minute departure that the model predicted as under 15 minutes.

There were 7,136 false negatives. Some severe errors had high actual delays despite low inbound delay or high scheduled slack. This shows that BTS fields do not capture every cause of delay.

## 8.2 False positives

A false positive is an under-15-minute departure that the model predicted as delayed.

There were 9,683 false positives. A false-positive example had 23 minutes of previous delay and 40 minutes of scheduled slack but an actual 14-minute departure delay, just below the threshold.

## 8.3 Error patterns by inbound delay

From [day4_april_errors_by_inbound_delay.csv](/C:/Users/Aditi%20Chauhan/Documents/ChatGPT/flight%20collision%20prediction%20model/reports/metrics/day4_april_errors_by_inbound_delay.csv):

- 0 or less inbound delay: actual rate 9.18%, recall 11.36%, precision 64.44%.
- 16-30 inbound delay: actual rate 60.59%, recall 97.08%, precision 79.58%.
- 31-60 inbound delay: actual rate 69.32%, recall 97.50%, precision 92.84%.
- Over 120 inbound delay: recall 95.61%, precision 92.15%.

The model is strongest on clearly high-inbound-delay cases and weak at identifying positive cases when inbound delay is 0 or below.

## 8.4 Error patterns by slack

- 0-15 minutes slack: actual delay rate 86.34%, recall 97.98%, precision 87.26%.
- 31-60 minutes slack: recall 79.49%, precision 71.52%.
- 361-720 minutes slack: actual delay rate 5.50%, recall 3.92%, but precision 41.86%.

Short slack produces many true delays and excellent recall. Very large slack is associated with a low delay rate and the model misses most true positives because few positive examples remain.

# Chapter 9: Scenario Simulation

Notebook: [07_scenario_simulation_and_demo.ipynb](/C:/Users/Aditi%20Chauhan/Documents/ChatGPT/flight%20collision%20prediction%20model/notebooks/07_scenario_simulation_and_demo.ipynb).

## 9.1 What a scenario is

A scenario copies an observed April pair and changes only `SCHEDULED_TURNAROUND_SLACK_MIN`. It holds previous delay, route, hour, weekday, actual times, and all other inputs fixed.

Buffers implemented: 0, 5, 10, 15, 20, 30, 45, and 60 minutes.

## 9.2 Residual-delay rule

```text
Residual = max(0, previous arrival delay
                 - scheduled slack
                 - added buffer)
Rule flags delayed if residual >= 15
```

Example:
- Previous inbound delay: 46 minutes.
- Scheduled slack: 40 minutes.
- +15 scenario.
- Residual: `46 - 40 - 15 = -9`, then clipped to `0`.
- The rule does not flag delay.

## 9.3 Demonstration tail

The selected illustrative tail is `N8804L`.

Four observed legs:
1. DTW→LAS: previous delay 46, slack 40, actual next delay 84.
2. LAS→DAL: previous delay 89, slack 45, actual next delay 93.
3. DAL→TPA: previous delay 99, slack 330, actual next delay 1.
4. TPA→HOU: previous delay 0, slack 60, actual next delay -1.

Adding 30 minutes changes the first flight's scenario score and residual, but the delay remains a historical observation. The timeline does not prove a causal schedule recovery.

## 9.4 Population scenario pattern

Mean model score:
- Baseline: 0.4233.
- +15: 0.3922.
- +30: 0.3586.
- +60: 0.3593.

Alert share:
- Baseline: 27.81%.
- +15: 24.17%.
- +30: 19.33%.
- +60: 19.48%.

This is a non-causal feature sensitivity analysis.

# Chapter 10: Dashboard

Files:
- [dashboard/dashboard.html](/C:/Users/Aditi%20Chauhan/Documents/ChatGPT/flight%20collision%20prediction%20model/dashboard/dashboard.html)
- [dashboard/styles.css](/C:/Users/Aditi%20Chauhan/Documents/ChatGPT/flight%20collision%20prediction%20model/dashboard/styles.css)
- [dashboard/app.js](/C:/Users/Aditi%20Chauhan/Documents/ChatGPT/flight%20collision%20prediction%20model/dashboard/app.js)
- [dashboard/dashboard-data.js](/C:/Users/Aditi%20Chauhan/Documents/ChatGPT/flight%20collision%20prediction%20model/dashboard/dashboard-data.js)

## 10.1 Architecture

HTML supplies structure and sections, CSS supplies responsive styling, and JavaScript loads `window.DASHBOARD_DATA`, filters rows, calculates display conditions, and draws SVG/DOM visualizations.

Opening `dashboard/dashboard.html` directly works because data is embedded locally. There is no server, database, API, or live Python model inference.

## 10.2 Dashboard sections

1. Overview KPIs: April pairs, accuracy, recall, ROC-AUC.
2. Filters: tail, origin, destination, month/date, severity, correct/incorrect, previous delay range, and slack range.
3. Flight chain: selected tail and chronological flight legs.
4. Selected flight: previous arrival, scheduled slack, actual next departure, stored model result.
5. Scatter and explainability: April sampled delay relationship and grouped importance views.
6. Feature sensitivity: +0 to +60 scenario comparisons.
7. Model performance: metrics and confusion matrix.
8. Data quality: missing tails, cancellations, diversions, timezone mappings, linked/rejected pairs.
9. Threshold calibration diagnostics and selected-flight SHAP reason codes.

## 10.3 Live versus stored

Predictions are loaded or reproduced in the saved dashboard export. The page does not train or call the Random Forest live. Relative scores are clearly marked as not probabilities.

# Chapter 11: Technologies

| Technology | Use |
|---|---|
| Python 3.11-3.13 | Main implementation and notebooks. |
| pandas | Tables, filtering, grouping, merging, CSV export. |
| NumPy | Vector calculations and transformations. |
| scikit-learn | Baselines, logistic regression, Random Forest, preprocessing, metrics. |
| Matplotlib | Saved report figures. |
| seaborn | Declared dependency for plotting support. |
| SHAP | Explainability dependency/reports. |
| ipywidgets | Optional Jupyter dashboard in notebook 08. |
| Jupyter | Interactive notebook execution. |
| HTML | Dashboard structure. |
| CSS | Dashboard design/responsive layout. |
| JavaScript | Filtering and stored-data visualization. |
| `zoneinfo` | IANA timezone conversion. |
| joblib | Declared model serialization dependency. |
| openpyxl | Excel support dependency. |
| pytest | Automated unit tests. |

Pinned project environment: Python 3.11-3.13; scikit-learn 1.5.2, pandas 2.2.3, NumPy 2.1.3, and pytest 8.3.4 in `pyproject.toml`.

# Chapter 12: Limitations and Future Scope

## 12.1 Dataset limitations

- One carrier and four months.
- Historical, retrospective data.
- Missing weather, crew, gate, airport capacity, runway, and real-time operational fields.
- No exact aircraft-swap information beyond tail sequences.
- Tail and airport handoff matching can reject valid observations and can miss operational complexity.

## 12.2 Model limitations

- Weak calibration.
- High-level feature importance is descriptive, not causal.
- April final metrics are historical and may not generalize.
- Random Forest is less directly interpretable than logistic regression.
- Tail number is not a model feature.
- Categorical airport encoding may be sparse.

## 12.3 Scenario limitations

- Artificially changes one feature.
- Does not alter actual departure time or downstream flights.
- Does not account for feasibility, crew rest, gates, runway capacity, or airport constraints.
- Not a validated schedule-recovery plan.

## 12.4 Future work

Add more carriers and months, real-time feeds, weather and airport capacity features, calibration with a validation set, operationally defined thresholds, wider model comparison, and feasibility-aware schedule optimization. Such work is future scope, not current implementation.

# Chapter 13: Viva Question Bank

The answers are written in simple spoken form.

## 13.1 Basic project questions

**1. What is the project title?**  
The Flight Delay Domino Effect.

**2. What problem does it solve?**  
It estimates whether an aircraft's next flight will depart at least 15 minutes late after considering its previous inbound delay and turnaround.

**3. Is this a collision prediction project?**  
No. It is a flight-delay propagation prototype despite the repository name.

**4. What is the target variable?**  
`DEP_DEL15`, 1 for departure delay of at least 15 minutes and 0 otherwise.

**5. What is a prediction row?**  
One current flight paired with its immediately previous flight on the same aircraft.

**6. What source dataset is used?**  
BTS Reporting Carrier On-Time Performance data.

**7. Which airline is studied?**  
Southwest Airlines, carrier code `WN`.

**8. What study period is used?**  
January-April 2026.

**9. How many raw records were inspected?**  
2,269,061 records across carriers across four monthly files.

**10. How many Southwest flight records were retained?**  
444,897.

**11. How many linked pairs were produced?**  
423,660.

**12. How many tails are represented?**  
808.

**13. Which model was selected?**  
An engineered Random Forest.

**14. What is the final April accuracy?**  
85.26%.

**15. What is the final recall?**  
75.54%.

**16. What is the final precision?**  
69.48%.

**17. What is the final F1?**  
72.39%.

**18. What is the final ROC-AUC?**  
0.887.

**19. Which month was held out?**  
April 2026.

**20. Did April select the model or threshold?**  
No. February validation selected model and threshold.

**21. What is the model threshold?**  
0.49879784491634016.

**22. Are dashboard scores probabilities?**  
No. The project explicitly uses relative model scores because calibration is weak.

**23. What does the dashboard use as data?**  
Stored exported data and model results, not a live API or live model.

**24. What is the project scope?**  
Historical delay-propagation analysis and simplified scenario demonstration.

**25. What is the expected outcome?**  
A validated historical benchmark and explainable dashboard, not a dispatch decision system.

## 13.2 Dataset questions

**26. Why use Southwest?**  
It has enough WN records and repeated aircraft sequences in this local sample for a pilot study.

**27. What raw data are included?**  
Extracted BTS monthly CSVs and source ZIPs.

**28. Why are raw and processed datasets excluded from Git?**  
They are large; the repository documents setup instead of committing them.

**29. What is `TAIL_NUM`?**  
The aircraft tail registration used to identify consecutive flights.

**30. What is `DEP_DELAY`?**  
The current flight's actual departure delay in minutes.

**31. What is `ARR_DELAY_NEW`?**  
The arrival delay in minutes; early arrival values are represented as zero.

**32. What is scheduled turnaround slack?**  
The difference between the current flight's scheduled departure and the previous flight's scheduled arrival.

**33. What is actual turnaround?**  
The difference between the current flight's actual departure and the previous flight's actual arrival.

**34. Why convert timestamps to UTC?**  
So flights across airport time zones can be sorted and subtract turnarounds consistently.

**35. How were airport time zones found?**  
The project uses the frozen `airport_timezones.csv` mapping, which covers 107 WN airports.

**36. How are 2400 clock values handled?**  
`2400` is parsed as midnight on the following day.

**37. How are arrivals placed on the correct date?**  
The project chooses the earliest plausible UTC arrival date after departure within 30 hours.

**38. How were cancellations handled?**  
They remain in flight-level/cancellation reports but are excluded from operated-flight pairs.

**39. How were diversions handled?**  
They remain in quality reports and barriers, but diverted operated flights are excluded.

**40. Why retain missing actual times instead of imputing them?**  
Missing times can have operational meaning and imputing a fake time would invent evidence.

**41. How many missing tail numbers are present?**  
726 in the WN flight file.

**42. How many exact duplicate rows were found?**  
No exact duplicates were found in the checked monthly data.

**43. How many candidate pairs existed?**  
438,130.

**44. How many pairs were rejected?**  
14,470.

**45. Why is not every consecutive tail event a pair?**  
It may have a cancellation/diversion, missing data, airport mismatch, or turnaround outside 0–24 hours.

## 13.3 Preprocessing questions

**46. What is normalization in this project?**  
Renaming alternate BTS headers to canonical names.

**47. What is the first preprocessing operation?**  
Load, validate, normalize headers, and filter to WN.

**48. What is filtering?**  
Keeping only records satisfying a condition, in this case `OP_UNIQUE_CARRIER == "WN"`.

**49. What is grouping?**  
Grouping records by `TAIL_NUM` before shifting previous-flight fields.

**50. What is sorting?**  
Ordering each tail's events chronologically using UTC departure times.

**51. What is merging in this workflow?**  
It maps airport codes to timezone names and creates pair fields, although the core pairing uses grouped shifting.

**52. What is a previous-flight field?**  
A value copied from the prior row of the same tail, such as `PREV_ARR_DELAY_MIN`.

**53. What formula calculates scheduled slack?**  
Current scheduled departure minus previous scheduled arrival.

**54. What formula calculates actual turnaround?**  
Current actual departure minus previous actual arrival.

**55. Why require 0–24 hour turnarounds?**  
To avoid implausible or disconnected sequences.

**56. Why require matching destination/origin?**  
It confirms physical handoff continuity: previous destination equals current origin.

**57. What happens if we do not convert time zones?**  
Flights in different regions cannot be compared or ordered correctly.

**58. What happens if we do not sort?**  
Previous-flight shifts may link unrelated chronological records.

**59. What happens if we do not remove cancelled flights?**  
Cancelled actual times and delay targets could create invalid rows or false propagation chains.

**60. What is `PARSED DATE` used for?**  
It is used to anchor local scheduled/actual clock values.

**61. What is class balance?**  
The 423,660-pair overall positive rate is 24.10%; April is 25.58%.

**62. Did preprocessing prevent target leakage?**  
Preprocessing itself built the target, but model inputs were restricted to pre-outcome fields.

**63. Which current-flight fields are excluded from predictors?**  
`DEP_DELAY_MIN`, `DEP_DEL15`, actual departure/arrival outcomes, and post-outcome fields.

**64. Why fit preprocessing inside pipelines?**  
It ensures train-only fitting and avoids leakage.

**65. What was median imputation used for?**  
Numeric missing values.

**66. What was mode imputation used for?**  
Categorical missing values.

**67. Why one-hot encode origin/destination?**  
They are nominal categories, not numeric magnitudes.

**68. Why scale for logistic regression?**  
Scaling gives comparable numeric ranges and improves optimization behavior.

**69. Why not scale Random Forest numeric features?**  
Tree splits are rank-based and do not require feature scaling.

# Chapter 14: EDA Question Bank

**70. What was the overall pair positive rate?**  
24.10% across all 423,660 pairs.

**71. What is the median previous-arrival delay?**  
0 minutes.

**72. What is the mean previous-arrival delay?**  
10.96 minutes.

**73. What pattern appears in the inbound-delay chart?**  
Next-flight delay rises sharply as previous arrival delay rises through moderate bands, then levels near high-delay bands.

**74. What pattern appears in the slack chart?**  
Very short slack is associated with a much higher next-delay rate.

**75. What is a band?**  
A range grouping used only for readable summaries.

**76. Does EDA prove causation?**  
No. It only shows association.

**77. What is the 0-15-minute slack delay rate?**  
84.34%.

**78. What is the 361-720-minute slack delay rate?**  
5.91%.

**79. Why were origin bars restricted to origins with at least 500 pairs?**  
To reduce noise from very small airport samples.

# Chapter 15: Feature Engineering Questions

**80. Why use log transforms?**  
They reduce the influence of long positive tails.

**81. Why clip previous delay and slack?**  
To keep the transformed values mathematically meaningful and avoid negative logs.

**82. Why add a short-slack flag?**  
To explicitly represent the under-60-minute condition.

**83. Why add an interaction?**  
It represents the hypothesis that inbound delay matters differently under short turnaround.

**84. Why use sine/cosine of hour?**  
It represents the cyclic 24-hour clock.

**85. Which feature had the greatest grouped importance?**  
`PREV_ARR_DELAY_LOG1P`, 37.33%.

**86. What was the second-largest grouped importance?**  
`PREV_DELAY_X_SHORT_SLACK`, 31.58%.

**87. Does feature importance mean causation?**  
No. It is impurity usage inside fitted trees.

**88. Did the model use tail number?**  
No. Tail number was used for pairing only.

**89. Did the model use month?**  
The verified selected engineered feature set did not include month.

**90. Did the model use actual turnaround?**  
No. It used scheduled turnaround slack.

# Chapter 16: Machine Learning Questions

**91. What is supervised learning?**  
Learning a relationship between input features and known labels.

**92. What is regression?**  
A task that predicts a continuous number. This project uses classification instead.

**93. What is a baseline?**  
A simple benchmark used to judge whether a candidate model adds value.

**94. What is overfitting?**  
Learning training patterns that do not generalize to later data.

**95. What is underfitting?**  
A model too simple to learn useful patterns.

**96. How did the project reduce overfitting risk?**  
Chronological holdout, pipeline preprocessing, limited Random Forest depth/leaf size, and no April tuning.

**97. Why is April holdout evidence stronger than February validation?**  
April was unseen during model and threshold selection and comes later chronologically.

**98. What is cross-validation?**  
A repeated partitioning method for estimating performance. It was not the core final holdout design for this project.

**99. Why not use random train-test splitting?**  
Random splitting could mix future and past flights and leak chronological patterns.

**100. Why use class_weight balanced?**  
It gives the positive and negative classes controlled relative importance in logistic and forest training.

**101. What is class_weight="balanced_subsample"?**  
It computes balanced class weights separately for each Random Forest bootstrap sample.

**102. What is max_depth?**  
The maximum number of splits in a tree branch.

**103. What is min_samples_leaf=40?**  
A leaf must contain at least 40 training rows to encourage smoother, less-specific leaves.

**104. What is max_features="sqrt"?**  
At each split, a square-root-sized random subset of features is considered.

**105. What is n_estimators=120?**  
The forest has 120 decision trees.

**106. What is random_state=42?**  
A seed for reproducible randomness.

**107. What is threshold tuning?**  
Choosing the score cutoff that produces the desired balance of precision and recall.

**108. Why did February threshold differ from 0.5?**  
February F1 maximization found 0.4987978, essentially close to 0.5.

**109. What is leakage?**  
Using information that would not be available at prediction time or using target-derived future data.

**110. What data were safe after actual departure?**  
Historical observed outputs can evaluate the model but cannot be used to predict that same outcome.

# Chapter 17: Difficult and Cross-Examination Questions

**111. Why is 85.26% accuracy not enough?**  
The positive class is only 25.58%, so precision, recall, confusion matrix, F1, and ranking metrics are needed.

**112. Why compare majority accuracy 74.42% to Random Forest 85.26%?**  
It shows a gain over predicting every flight as under 15 minutes.

**113. Why do you call the 85.26% model useful?**  
It has meaningful recall and ranking metrics on an unseen month, but usefulness still depends on an operational objective.

**114. How do you know there is no target leakage?**  
The target was excluded from predictors, as were current-flight actual delay and post-outcome fields. Preprocessing and model transformations fit on training partitions only.

**115. How do you know there is no time leakage in the final holdout?**  
The model was fit through March and evaluated on April; April did not tune features, model settings, or threshold.

**116. Did you tune any model using April?**  
No. April results are only for final reporting and error/scenario analysis.

**117. How do you know the model does not overfit?**  
Its holdout is chronological and it has regularization constraints such as limited depth and minimum leaf size. This does not prove universal generalization.

**118. Does 808 tails over four months provide enough data?**  
The pair table is large, but carrier/season/generalization limits remain.

**119. Why not include weather?**  
It is absent from the current BTS fields and was outside the project implementation.

**120. Why not include crew or airport capacity?**  
The project lacks those data sources.

**121. What happens in an insufficient-turnaround case?**  
The model and EDA associate slack under 60 minutes with higher delay risk, especially with short 0-15 minute bands. It is a retrospective association, not a confirmed causal intervention.

**122. What happens if actual turnaround is 10 minutes but scheduled slack is 60?**  
The model receives scheduled slack, not actual turnaround, so it would use 60-minute slack in the prediction.

**123. Are model scores calibrated probabilities?**  
No, because ECE and Brier/calibration bins show weak agreement with observed frequencies.

**124. Why do the February and April calibration rates differ?**  
The class rate changed and the model is not perfectly recalibrated. This is one reason not to call the score a probability.

**125. Which scenario conclusion is legitimate?**  
Adding the slack feature lowers the stored scores and rule flags in the April population in many ranges.

**126. Which scenario conclusion is not legitimate?**  
Claiming that adding physical schedule slack caused delay reduction or that an airline should change schedules.

**127. What is the difference between empirical and simulated?**  
Empirical results come from observed April flights and outcomes. Scenario results change a feature artificially and keep historical observations fixed.

**128. Can the model explain all delay?**  
No. BTS data omits many operational causes.

**129. What is the biggest weakness?**  
Weak calibration and limited scope/generalization, plus missing weather, crew, gate, and capacity features.

**130. What is the second biggest weakness?**  
The scenario is not causal or feasible and should not be used for real decisions.

**131. Why not use deep learning?**  
The dataset and structured features were suitable for simpler baselines and trees; no deep-learning implementation was required or verified.

**132. Why not use XGBoost?**  
XGBoost is not implemented in the repository and was not part of verified model comparison.

**133. Why not use KNN or SVM?**  
They were not implemented. Random Forest was selected for strong tabular performance and interaction handling.

**134. Why not use all 110 raw BTS columns?**  
Many are redundant, post-outcome, operationally unavailable, or sparsely populated. The project uses defined and defensible inputs.

**135. What exact personal contribution is safe to claim?**  
Only claim work shown in your team contribution records or your own verified files/code. The repository does not assign individual student contributions.

**136. What is more dangerous: false positive or false negative?**  
In this project, a false positive creates an unnecessary delay alert; a false negative misses an actual 15+ minute delay. Which is costlier depends on an airline's intervention cost, so no fixed operational priority was established.

**137. Why is threshold 0.4988 close to 0.5?**  
It was selected using February F1 and happened to be nearly 0.5.

**138. Why might a lower threshold be useful?**  
It usually catches more positive cases but creates more false positives.

**139. Why might a higher threshold be useful?**  
It usually improves precision among alerts but misses more delayed flights.

**140. Why is ROC-AUC 0.887 not calibration?**  
It measures ranking across thresholds, not whether a score 0.7 means a 70% observed delay rate.

**141. What is PR-AUC?**  
Average precision across the precision-recall curve, useful when positive outcomes are a minority.

**142. Why is average precision stronger for imbalanced data?**  
It emphasizes classification quality for the positive class, though it still must be interpreted with class rates.

**143. What if the next month has a lower delay rate?**  
Metrics and calibration may change because class prevalence and operating conditions change.

**144. How would you improve the project?**  
Add more months and weather/crew/airport features, calibrate on development data, define a cost-based threshold, and test on a later untouched month.

**145. How would you deploy it?**  
A future deployment would use a fresh feature pipeline and real-time aircraft sequence data, expose a clear confidence/alert label, and require human operational review.

**146. What should never be deployed unchanged?**  
The scenario engine or current weakly calibrated Random Forest as an airline operational recommendation.

**147. What is the project individually reproducible?**  
Run notebooks 02-07 in order after installing dependencies and preparing data. Tests cover preprocessing/scenario helpers.

**148. Which file proves model configuration?**  
`src/features.py`, notebook 05/06, and `reports/metrics/day4_run_summary.json`.

**149. Which file proves final metrics?**  
`reports/metrics/day3_april_final_metrics.csv` and `day3_april_final_summary.json`.

**150. Which file proves the confusion matrix?**  
`reports/metrics/day4_april_confusion_matrix.csv`.

# Chapter 18: Practical Demonstration Script

## 18.1 Before the viva

1. Open the project root in VS Code.
2. Confirm the processed files and dashboard data exist.
3. Open `README.md` briefly.
4. Open the notebook list in lifecycle order.

## 18.2 5-minute demonstration

**Minutes 0-1: data and target**
- Open notebook 01 and explain the BTS data and 15-minute target.
- Open notebook 02 and show UTC conversion and pair construction.

**Minutes 1-2: EDA**
- Open notebook 03 or the saved figure [propagation_by_inbound_delay_and_slack.png](/C:/Users/Aditi%20Chauhan/Documents/ChatGPT/flight%20collision%20prediction%20model/reports/figures/propagation_by_inbound_delay_and_slack.png).
- Explain the short-slack and inbound-delay patterns.

**Minutes 2-3: model**
- Open notebook 05.
- Explain January-February selection and the April holdout.
- Show the final metrics table.

**Minutes 3-4: errors and features**
- Open notebook 06.
- Show the confusion matrix and feature importance.
- Explain calibration weakness.

**Minutes 4-5: dashboard**
- Open `dashboard/dashboard.html`.
- Select tail `N8804L`.
- Show the flight chain, model score, scenario sliders, and performance matrix.
- End with limitations.

# Chapter 19: Final Revision

## 19.1 One-page cheat sheet

**Project:** Flight Delay Domino Effect.

**Goal:** Predict next-flight departure delay of 15+ minutes.

**Data:** BTS January-April 2026, Southwest WN.

**Raw:** 2,269,061 all-carrier records; 444,897 WN records.

**Pairs:** 423,660 across 808 tails.

**Target:** `DEP_DELAY >= 15`.

**Main inputs:** previous arrival delay, scheduled turnaround slack, origin, destination, departure hour, weekday.

**Engineered inputs:** log delay/slack, short-slack flag, interaction, sine/cosine hour.

**Chronology:** January fit; February validation/threshold; January-March final fit; April final test.

**Selected model:** Engineered Random Forest, 120 trees, depth 14, leaf 40, sqrt features, balanced subsampling.

**Threshold:** 0.49879784491634016.

**April:** 114,084 rows; positive rate 25.58%.

**Results:** Accuracy 85.26%; precision 69.48%; recall 75.54%; F1 72.39%; ROC-AUC 0.887; average precision 0.8178.

**Confusion matrix:** TN 75,221; FP 9,683; FN 7,136; TP 22,044.

**Calibration:** February ECE 0.2027; April ECE 0.1832. Scores are not probabilities.

**Feature importance:** inbound log 37.33%; delay × short slack 31.58%; hour sine 11.90%; scheduled log slack 8.00%.

**Scenario:** feature-only slack buffers; baseline mean score 0.4233, +15 0.3922, +30 0.3586.

**Demo tail:** `N8804L`.

**Never claim:** it predicts collisions, it proves causation, or dashboard scores are precise probabilities.

## 19.2 Important formulas

```text
Target: DEP_DEL15 = 1 if DEP_DELAY >= 15 else 0

Scheduled slack =
  current scheduled departure UTC
  - previous scheduled arrival UTC

Actual turnaround =
  current actual departure UTC
  - previous actual arrival UTC

Log1p(x) = ln(1 + x)

Accuracy = (TP + TN) / all
Precision = TP / (TP + FP)
Recall = TP / (TP + FN)
F1 = 2PR / (P + R)

Residual = max(0, previous arrival delay - scheduled slack - added buffer)
```

## 19.3 Important dataset columns

`TAIL_NUM`, `OP_CARRIER_FL_NUM`, `ORIGIN`, `DEST`, `CRS_DEP_TIME`, `DEP_TIME`, `DEP_DELAY`, `CRS_ARR_TIME`, `ARR_TIME`, `ARR_DELAY_NEW`, `CANCELLED`, `DIVERTED`, `YEAR`, `MONTH`, `DAY_OF_MONTH`.

Engineered: `PREV_ARR_DELAY_MIN`, `SCHEDULED_TURNAROUND_SLACK_MIN`, `PREV_ARR_DELAY_LOG1P`, `SCHEDULED_SLACK_LOG1P`, `SHORT_SLACK_LT_60`, `PREV_DELAY_X_SHORT_SLACK`, `DEPARTURE_HOUR_SIN`, `DEPARTURE_HOUR_COS`, `ORIGIN`, `DEST`, `DAY_OF_WEEK`.

## 19.4 30 most likely questions

1. What is the problem? A delay-propagation classifier.
2. What is the target? `DEP_DEL15`.
3. What unit is predicted? A current/previous flight pair on one tail.
4. Where did data come from? BTS.
5. Why Southwest? Available WN sample and repeated sequences.
6. How many pairs? 423,660.
7. How many tails? 808.
8. How did you calculate slack? Current scheduled departure minus previous scheduled arrival.
9. How did you link flights? Tail, chronological sorting, destination-origin match.
10. How did you handle missing values? Missing indicators/times were retained or excluded appropriately; model median/mode imputers handle numeric/categorical values.
11. Why UTC? Cross-airport sorting and timing.
12. Why 2400 handling? It represents next-day midnight.
13. Which features are used? Six engineered numerics plus three categorical fields.
14. Why log transform? Compress long tails.
15. Why cyclic hour? Connect hour 23 and hour 0.
16. Which baseline models? Majority and balanced logistic regression.
17. Which final model? Engineered Random Forest.
18. Why Random Forest? Captures nonlinear interactions and selected by February F1.
19. What is 120? Number of trees.
20. What is class_weight balanced? Adjusted class influence.
21. How did you split? Chronological.
22. Did April tune model? No.
23. What are final metrics? 85.26%, 69.48%, 75.54%, 72.39%, 0.887.
24. What is precision? Positive predictive value.
25. What is recall? Proportion of actual positives detected.
26. What is F1? Harmonic mean.
27. What is ROC-AUC? Ranking ability.
28. What is calibration weakness? ECE 0.1832 in April.
29. What does dashboard demonstrate? Chains, risk scores, scenarios, and performance.
30. What are limitations? Scope, missing operational features, weak calibration, no causality.

## 19.5 20 difficult questions

1. Why 15 minutes? It is the project's selected delay threshold.
2. Why not random split? It would mix chronology.
3. How prevent leakage? Exclude current-flight outcome fields and fit preprocessing on train only.
4. Why 24-hour turnaround cutoff? Defines realistic/complete pair continuity.
5. How handle cancellation as a barrier? It remains in events but cannot start an ordinary operated pair.
6. Why tail number is not a feature? It is an identifier that would not generalize and could memorize sequences.
7. What does accuracy fail to show? Minority-class performance.
8. Why 69.48% precision? 22,044 true positives out of 31,727 alerts.
9. Why 75.54% recall? 22,044 true positives out of 29,180 actual positives.
10. Why not call score probability? Calibration validation results do not support it.
11. What is a false positive? Under-15 flight falsely flagged.
12. What is a false negative? 15+ flight missed.
13. How did feature importance aggregate? Encoded importance summed back to original input fields.
14. Is importance causal? No.
15. What did +30 scenario mean? Changed only slack feature.
16. Does it simulate a real schedule? No.
17. Why was N8804L selected? It met the deterministic eligibility and ranking criteria.
18. Is N8804L proof of propagation? No, it is an illustrative chain.
19. Why model result differs from observed outcome? It is a test prediction; errors are expected.
20. What future deployment is proposed? Real-time, calibrated, broader-feature, human-reviewed system—not current claims.

## 19.6 Complete 5-minute presentation script

“Good morning. My project is The Flight Delay Domino Effect. It studies delay propagation for Southwest Airlines. The objective is to predict whether an aircraft's next flight will depart at least 15 minutes late.

We use BTS Reporting Carrier On-Time Performance data for January through April 2026. There are 444,897 Southwest flight records and 423,660 valid aircraft-flight pairs across 808 tails.

We connect flights by tail number and require a destination-origin handoff and a turnaround of 0–24 hours. Cancelled and diverted flights are excluded from the pair model but retained in quality reports. We convert airport-local times to UTC and calculate scheduled and actual turnarounds.

The target is `DEP_DEL15`: one if current departure delay is at least 15 minutes. Main inputs are previous arrival delay and scheduled turnaround slack. We add log transforms, short-slack interaction, and cyclical departure-hour features.

We compare a majority baseline and balanced logistic regression with an engineered Random Forest. January was used for candidate fitting, February for model and threshold selection, and January-March for final refitting. April was a fresh holdout.

The selected model achieved 85.26 percent accuracy, 69.48 percent precision, 75.54 percent recall, 72.39 percent F1, and 0.887 ROC-AUC. The confusion matrix shows 22,044 true positives and 7,136 false negatives.

Calibration is weak, so model output is presented as a relative score rather than a true probability. We also show sensitivity to added scheduled slack. This is not a causal or operational schedule recommendation.

The HTML/CSS/JavaScript dashboard demonstrates the chain, selected flight, model performance, error patterns, and scenarios using stored analysis data.

The main limitations are one carrier, four months, missing weather/crew/capacity data, weak calibration, and the retrospective nature of the data. Future work could include more months and carriers, additional real-time features, calibration, and cost-based threshold selection.”

# Things That Must Never Be Incorrectly Claimed

1. Do not say it predicts aircraft collisions.
2. Do not say it predicts actual delay in exact minutes; it predicts a binary 15-minute threshold.
3. Do not say tail number is a model feature.
4. Do not say April was used for tuning.
5. Do not claim the Random Forest score is a calibrated probability.
6. Do not claim a 15/30-minute scenario proves causality.
7. Do not claim the scenario recommends a real schedule change.
8. Do not say cancellations were imputed.
9. Do not say the project uses live data.
10. Do not say weather, crew, or airport capacity was included.
11. Do not claim 85.26% is deployment-ready.
12. Do not claim all 808 tails are independently tested.
13. Do not claim a sample row proves delay propagation for every airline.
14. Do not claim feature importance proves causation.
15. Do not claim cross-validation was used as the final holdout unless specifically discussing a method not implemented.
