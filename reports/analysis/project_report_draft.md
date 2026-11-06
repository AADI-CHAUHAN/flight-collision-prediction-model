# The Flight Delay Domino Effect

## Can an aircraft's inbound delay help predict its next departure delay?

**Project report draft — CSL236, Introduction to AI & ML**  
**Study period:** January-April 2026  
**Dataset:** BTS Reporting Carrier On-Time Performance, Southwest Airlines (`WN`)

## Abstract

This project tests whether delay to a Southwest aircraft's inbound flight can help predict a delay to its next flight. We built one record per pair of consecutive flights operated by the same aircraft, then predicted whether the later flight departed at least 15 minutes late. The final model was an engineered Random Forest, selected using February validation data and evaluated on April flights after training through March. On the April set, it achieved 85.26% accuracy, 75.54% recall, 72.39% F1, and 0.887 ROC-AUC. Its probability calibration was poor, so its output should be interpreted as a relative model score rather than a precise operational risk percentage. A separate +15/+30 minute turnaround-slack demonstration is an illustrative feature-only scenario, not a causal estimate of schedule changes.

## 1. Problem and objective

Flight disruptions can affect later flights when the same aircraft operates multiple legs. The project asks: **when a Southwest aircraft arrives late, can we predict whether its next operated flight will depart at least 15 minutes late?** The prototype also examines how model scores and a simple residual-delay rule change when scheduled turnaround slack is hypothetically increased by 15 or 30 minutes.

The goal is a small, explainable prediction and scenario-analysis prototype. It does not choose a new flight route, allocate runway slots, or recommend a real airline schedule change.

## 2. Dataset and preparation

We used the U.S. Department of Transportation Bureau of Transportation Statistics (BTS) Reporting Carrier On-Time Performance table for January through April 2026. The four monthly files contain 2,269,061 records across carriers; filtering to Southwest produced 444,897 flight records. The files contain scheduled and actual times, routes, aircraft tail numbers, delay values, cancellations, and diversions. April's downloaded selection contains 17 core columns; the January-March files contain 23. The required fields are available in all four months, while some optional precomputed fields are absent in April.

Scheduled and actual clock times are local to the airport, so we mapped 107 Southwest airport codes to IANA time zones and converted timestamps to UTC before ordering aircraft events. We parsed `2400` as midnight on the following day and handled arrival-date rollover. The mapping includes STS, added for the April sample using the airport's published local-time information.

The target is `DEP_DEL15 = 1` when current-flight `DEP_DELAY >= 15`; otherwise it is 0. Cancelled and diverted records remain in flight-level and cancellation summaries, but are excluded from the operated-flight classifier. Events with reported departures remain as sequence barriers, preventing the pipeline from linking across an intervening cancellation or diversion.

A linked pair must have the same aircraft tail, a matching prior destination/current origin, usable schedule and arrival/departure times, and both scheduled and actual turnaround intervals between 0 and 24 hours. This yielded **423,660 pairs** across 808 aircraft tails. The four-month sample also contains 5,969 Southwest cancellations and 798 diversions. Missing actual times were kept missing because they can describe cancellations, diversions, or incomplete operations; they were not filled with fabricated values.

## 3. Features and evaluation design

The prediction unit is a current flight with its immediately preceding flight on the same aircraft. Features include the previous arrival delay, scheduled turnaround slack, route, weekday, and scheduled departure hour. Feature engineering adds log-transformed delay and slack, a short-slack indicator, an interaction between inbound delay and short slack, and cyclical hour features.

We excluded current-flight actual delay and post-outcome timestamps from model inputs to avoid target leakage. Imputation, scaling, and category encoding are fitted inside scikit-learn pipelines on training data only. The majority-class model and logistic regression provide baselines.

For model selection, January was used to fit candidates and February to compare them and select the threshold by F1. The engineered Random Forest was selected with a threshold of 0.4988. It was then refitted on January-March and evaluated on April. March had already been examined during the earlier benchmark; April is the final month used for the headline evaluation. No model settings or threshold were chosen using April.

## 4. Results

The April test set contains 114,084 linked flight pairs, of which 25.58% had a 15+ minute departure delay.

| Model (January-March fit) | Accuracy | Precision | Recall | F1 | ROC-AUC | Average precision |
|---|---:|---:|---:|---:|---:|---:|
| Majority baseline | 0.7442 | 0.0000 | 0.0000 | 0.0000 | 0.5000 | 0.2558 |
| Balanced logistic regression | 0.7859 | 0.5611 | 0.7488 | 0.6415 | 0.8487 | 0.6989 |
| Engineered Random Forest | **0.8526** | **0.6948** | **0.7554** | **0.7239** | **0.8870** | **0.8178** |

The Random Forest confusion matrix was:

|  | Predicted under 15 min | Predicted 15+ min |
|---|---:|---:|
| **Actually under 15 min** | 75,221 | 9,683 |
| **Actually 15+ min** | 7,136 | 22,044 |

It detected 22,044 of the 29,180 delayed flights in April (75.54% recall). Of 31,727 flights it flagged, 22,044 were delayed (69.48% precision). Previous-flight arrival delay and its interaction with short turnaround slack had the largest grouped impurity importances. Feature importance is descriptive and does not establish that changing those inputs would cause a delay to change.

### Calibration and interpretation

Calibration was weak: February validation expected calibration error (ECE) was 0.2027, and April's descriptive ECE was 0.1832. Predicted scores were higher than observed delay rates in most low- and medium-score bins. Therefore, we report threshold alerts, rankings, and classification metrics, but do not interpret the score as a calibrated probability of delay.

### Turnaround-slack scenarios

In an April feature-only scenario, mean model score decreased from 0.4233 at baseline to 0.3922 with +15 minutes and 0.3586 with +30 minutes. The transparent rule—residual inbound delay equals `max(0, previous arrival delay - scheduled slack - added buffer)`—flagged 2.87%, 1.80%, and 1.20% of pairs, respectively. Rule/model agreement ranged from 75.0% to 81.8%.

These numbers do **not** mean real schedule changes would prevent those delays. The model changes one slack feature while holding all other inputs and actual conditions fixed. It does not simulate a moved departure's effects on later flights, crew, gates, runway capacity, or other constraints. The rule is a simple cross-check, not operational ground truth.

## 5. Limitations and next steps

- The study covers one carrier and four months. Performance may differ across seasons, carriers, airports, and operating conditions.
- BTS fields do not fully represent weather, crew legality, airport capacity, gate availability, aircraft swaps, or real-time schedule updates.
- Retrospective associations do not prove causal delay propagation.
- Poor probability calibration limits probability-based recommendations. Any future calibration should be fitted using development/validation data and assessed on a fresh holdout month.
- The +15/+30 minute scenario is a feature perturbation, not an optimized or feasibility-checked schedule recovery plan.
- Future work could add more months, validate on another untouched period, study calibration and threshold choices for a defined operational objective, and compare broader models without changing the held-out test after inspecting it.

## Reproducibility and project files

Read the notebooks from top to bottom in this order:

1. `../../notebooks/01_data_collection_and_understanding.ipynb` — project scope and source inventory.
2. `../../notebooks/02_data_preprocessing.ipynb` — raw profiling, time-zone conversion, and flight-pair construction.
3. `../../notebooks/03_exploratory_data_analysis.ipynb` — delay and propagation analysis.
4. `../../notebooks/04_baseline_model_development.ipynb` — majority and logistic-regression baselines.
5. `../../notebooks/05_model_training_and_optimization.ipynb` — feature/model selection and April holdout evaluation.
6. `../../notebooks/06_model_evaluation_and_error_analysis.ipynb` — calibration, feature importance, and error review.
7. `../../notebooks/07_scenario_simulation_and_demo.ipynb` — turnaround-slack scenarios and chain timeline.
8. `../../notebooks/08_interactive_dashboard.ipynb` — optional widget-based presentation.

Install dependencies from `../../requirements.txt`. Metrics are saved under `../metrics/`, figures under `../figures/`, and written analysis under `./`.

## References

- BTS, [Reporting Carrier On-Time Performance](https://transtats.bts.gov/TableInfo.asp?QO_fu146_anzr=b0-gvzr&V0s1_b0yB=D&gnoyr_VQ=FGJ). Source for monthly flight records and field definitions.
- `airportsdata` package, [PyPI project page](https://pypi.org/project/airportsdata/). Used for the initial airport-code/time-zone lookup; STS was added using [Charles M. Schulz-Sonoma County Airport pilot information](https://www.flysts.com/general-aviation/pilot-information/).
- The project notebooks were developed with AI assistance. Confirm the final course's AI-use disclosure requirements, and ensure every team member can explain and verify the submitted work.
