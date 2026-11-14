from datetime import date, datetime, timezone

import pandas as pd

from src.preprocessing import arrival_to_utc, create_flight_pairs, create_target, normalize_bts_columns, parse_clock


def test_parse_clock_handles_2400_and_invalid_values():
    assert parse_clock(2400, date(2026, 1, 1)) == datetime(2026, 1, 2)
    assert parse_clock(1234, date(2026, 1, 1)) == datetime(2026, 1, 1, 12, 34)
    assert parse_clock(1260, date(2026, 1, 1)) is None


def test_arrival_conversion_rolls_to_next_day():
    departure = datetime(2026, 1, 1, 23, 30, tzinfo=timezone.utc)
    result = arrival_to_utc(30, date(2026, 1, 1), "UTC", departure)
    assert result == datetime(2026, 1, 2, 0, 30, tzinfo=timezone.utc)


def test_create_target_uses_configured_threshold():
    result = create_target(pd.DataFrame({"DEP_DELAY": [14, 15, 30]}))
    assert result["DEP_DEL15"].tolist() == [0, 1, 1]


def test_normalize_bts_columns_accepts_current_download_headers():
    result = normalize_bts_columns(pd.DataFrame(columns=["Year", "Month", "DayofMonth", "Reporting_Airline", "IATA_CODE_Reporting_Airline", "Tail_Number", "DepDelay", "ArrDelayMinutes", "Cancelled", "Diverted"]))
    assert {"YEAR", "MONTH", "DAY_OF_MONTH", "OP_UNIQUE_CARRIER", "TAIL_NUM", "DEP_DELAY", "ARR_DELAY_NEW", "CANCELLED", "DIVERTED"} <= set(result.columns)
    assert list(result.columns).count("OP_UNIQUE_CARRIER") == 1


def test_create_flight_pairs_links_matching_handoff_only():
    base = {
        "TAIL_NUM": ["N1", "N1", "N2"],
        "ACTUAL_DEP_UTC": pd.to_datetime(["2026-01-01 08:00Z", "2026-01-01 10:00Z", "2026-01-01 10:00Z"]),
        "ACTUAL_ARR_UTC": pd.to_datetime(["2026-01-01 09:00Z", "2026-01-01 11:00Z", "2026-01-01 11:00Z"]),
        "SCHEDULED_DEP_UTC": pd.to_datetime(["2026-01-01 08:00Z", "2026-01-01 10:00Z", "2026-01-01 10:00Z"]),
        "SCHEDULED_ARR_UTC": pd.to_datetime(["2026-01-01 09:00Z", "2026-01-01 11:00Z", "2026-01-01 11:00Z"]),
        "DEP_DELAY": [0, 20, 20], "ARR_DELAY_NEW": [0, 10, 10],
        "CANCELLED": [0, 0, 0], "DIVERTED": [0, 0, 0],
        "DEST": ["B", "C", "C"], "ORIGIN": ["A", "B", "A"],
        "FLIGHT_DATE": pd.to_datetime(["2026-01-01"] * 3),
        "OP_CARRIER_FL_NUM": [1, 2, 3],
    }
    result = create_flight_pairs(pd.DataFrame(base))
    assert len(result) == 1
    assert result.iloc[0]["PREV_FLIGHT_NUM"] == 1
