import pandas as pd
import pytest

from src.scenarios import add_scenario_columns, residual_delay
from src.features import add_engineered_features


def test_residual_delay_never_goes_below_zero():
    result = residual_delay(pd.Series([40, 10]), pd.Series([15, 20]), 15)
    assert result.tolist() == [10, 0]


def test_add_scenario_columns_creates_rule_target():
    frame = pd.DataFrame({"PREV_ARR_DELAY_MIN": [40], "SCHEDULED_TURNAROUND_SLACK_MIN": [15]})
    result = add_scenario_columns(frame, 15)
    assert result.loc[0, "RULE_RESIDUAL_DELAY_MIN"] == 10
    assert result.loc[0, "RULE_FLAGS_DELAYED"] == 0


def test_feature_engineering_is_deterministic_and_preserves_inputs():
    frame = pd.DataFrame({
        "PREV_ARR_DELAY_MIN": [30], "SCHEDULED_TURNAROUND_SLACK_MIN": [45],
        "DEPARTURE_HOUR_LOCAL": [6], "ORIGIN": ["DAL"], "DEST": ["HOU"], "DAY_OF_WEEK": [3],
    })
    result = add_engineered_features(frame)
    assert result.loc[0, "PREV_ARR_DELAY_LOG1P"] == pytest.approx(3.433987)
    assert result.loc[0, "SHORT_SLACK_LT_60"] == 1
    assert result.loc[0, "DEPARTURE_HOUR_SIN"] == pytest.approx(1.0)
    assert list(frame.columns) == ["PREV_ARR_DELAY_MIN", "SCHEDULED_TURNAROUND_SLACK_MIN", "DEPARTURE_HOUR_LOCAL", "ORIGIN", "DEST", "DAY_OF_WEEK"]
