"""Leakage-aware feature engineering used by the model notebooks."""

import numpy as np
import pandas as pd


ENGINEERED_NUMERIC_FEATURES = [
    "PREV_ARR_DELAY_LOG1P", "SCHEDULED_SLACK_LOG1P", "SHORT_SLACK_LT_60",
    "PREV_DELAY_X_SHORT_SLACK", "DEPARTURE_HOUR_SIN", "DEPARTURE_HOUR_COS",
]
ENGINEERED_CATEGORICAL_FEATURES = ["ORIGIN", "DEST", "DAY_OF_WEEK"]
ENGINEERED_FEATURES = ENGINEERED_NUMERIC_FEATURES + ENGINEERED_CATEGORICAL_FEATURES


def add_engineered_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Add model features without using post-outcome fields."""
    result = frame.copy()
    previous_delay = pd.to_numeric(result["PREV_ARR_DELAY_MIN"], errors="coerce").clip(lower=0)
    slack = pd.to_numeric(result["SCHEDULED_TURNAROUND_SLACK_MIN"], errors="coerce").clip(lower=0)
    hour = pd.to_numeric(result["DEPARTURE_HOUR_LOCAL"], errors="coerce")
    result["PREV_ARR_DELAY_LOG1P"] = np.log1p(previous_delay)
    result["SCHEDULED_SLACK_LOG1P"] = np.log1p(slack)
    result["SHORT_SLACK_LT_60"] = (slack < 60).astype("int8")
    result["PREV_DELAY_X_SHORT_SLACK"] = result["PREV_ARR_DELAY_LOG1P"] * result["SHORT_SLACK_LT_60"]
    result["DEPARTURE_HOUR_SIN"] = np.sin(2 * np.pi * hour / 24)
    result["DEPARTURE_HOUR_COS"] = np.cos(2 * np.pi * hour / 24)
    return result
