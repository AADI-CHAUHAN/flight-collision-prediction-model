"""Deterministic feature-only turnaround scenario calculations."""

import pandas as pd


def residual_delay(previous_arrival_delay: pd.Series, scheduled_slack: pd.Series, added_slack: int = 0) -> pd.Series:
    """Estimate remaining inbound delay after scheduled and hypothetical slack."""
    return (previous_arrival_delay - scheduled_slack - added_slack).clip(lower=0)


def add_scenario_columns(frame: pd.DataFrame, added_slack: int) -> pd.DataFrame:
    """Return a scenario copy with the transparent residual-delay rule applied."""
    result = frame.copy()
    result["EXTRA_SCHEDULED_SLACK_MIN"] = added_slack
    result["RULE_RESIDUAL_DELAY_MIN"] = residual_delay(
        result["PREV_ARR_DELAY_MIN"], result["SCHEDULED_TURNAROUND_SLACK_MIN"], added_slack
    )
    result["RULE_FLAGS_DELAYED"] = result["RULE_RESIDUAL_DELAY_MIN"].ge(15).astype("int8")
    return result
