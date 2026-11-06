# Day 4 - Model review and error analysis

## Locked evaluation

Selected model: Engineered Random Forest; threshold: 0.4988, chosen on February validation. April was not used for model or threshold selection.

April results:

| Metric | Value |
|---|---:|
| Accuracy | 0.8526 |
| Precision | 0.6948 |
| Recall | 0.7554 |
| F1 | 0.7239 |
| ROC-AUC | 0.8870 |
| Average precision | 0.8178 |
| Brier score | 0.1332 |

## Calibration

February validation Brier score: 0.1416; ECE: 0.2027.
April descriptive Brier score: 0.1332; ECE: 0.1832. Calibration is not adjusted in this review.

## Leading grouped feature importances

| Input field | Importance |
|---|---:|
| PREV_ARR_DELAY_LOG1P | 0.3733 |
| PREV_DELAY_X_SHORT_SLACK | 0.3158 |
| DEPARTURE_HOUR_SIN | 0.1190 |
| SCHEDULED_SLACK_LOG1P | 0.0800 |
| SHORT_SLACK_LT_60 | 0.0521 |
| DEPARTURE_HOUR_COS | 0.0230 |
| ORIGIN | 0.0178 |
| DAY_OF_WEEK | 0.0122 |

## Limitations

Importance is not causal evidence. April errors are retrospective cases, and this BTS subset lacks complete weather, crew, airport capacity, and real-time schedule information. The examples and subgroup tables are diagnostic only; no April-based model changes were made.
