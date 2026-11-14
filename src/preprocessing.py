"""Pure preprocessing helpers shared by notebooks and automated tests."""

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pandas as pd


BTS_COLUMN_ALIASES = {
    "Tail_Number": "TAIL_NUM",
    "Flight_Number_Reporting_Airline": "OP_CARRIER_FL_NUM",
    "OriginAirportID": "ORIGIN_AIRPORT_ID",
    "DestAirportID": "DEST_AIRPORT_ID",
    "CRSDepTime": "CRS_DEP_TIME",
    "DepTime": "DEP_TIME",
    "DepDelay": "DEP_DELAY",
    "DepDelayMinutes": "DEP_DELAY_NEW",
    "CRSArrTime": "CRS_ARR_TIME",
    "ArrTime": "ARR_TIME",
    "ArrDelayMinutes": "ARR_DELAY_NEW",
    "Cancelled": "CANCELLED",
    "CancellationCode": "CANCELLATION_CODE",
    "Diverted": "DIVERTED",
    "DayofMonth": "DAY_OF_MONTH",
}


def normalize_bts_columns(frame: pd.DataFrame) -> pd.DataFrame:
    """Normalize current BTS download headers to the notebook's canonical names."""
    result = frame.rename(columns={key: value for key, value in BTS_COLUMN_ALIASES.items() if key in frame.columns}).copy()
    # Current BTS files contain both names. Prefer the IATA code because it is
    # the direct carrier code used by the project, and never create duplicate
    # canonical columns during renaming.
    if "OP_UNIQUE_CARRIER" not in result.columns:
        for carrier_column in ("IATA_CODE_Reporting_Airline", "Reporting_Airline"):
            if carrier_column in result.columns:
                result = result.rename(columns={carrier_column: "OP_UNIQUE_CARRIER"})
                break
    if "YEAR" not in result.columns and "Year" in result.columns:
        result = result.rename(columns={"Year": "YEAR"})
    if "MONTH" not in result.columns and "Month" in result.columns:
        result = result.rename(columns={"Month": "MONTH"})
    if "DAY_OF_WEEK" not in result.columns and "DayOfWeek" in result.columns:
        result = result.rename(columns={"DayOfWeek": "DAY_OF_WEEK"})
    if "ORIGIN" not in result.columns and "Origin" in result.columns:
        result = result.rename(columns={"Origin": "ORIGIN"})
    if "DEST" not in result.columns and "Dest" in result.columns:
        result = result.rename(columns={"Dest": "DEST"})
    return result


def parse_clock(value: object, local_date: date) -> datetime | None:
    """Parse a BTS HHMM value, including 2400 as next-day midnight."""
    if pd.isna(value) or not str(value).strip():
        return None
    try:
        numeric = int(float(str(value).strip()))
    except (TypeError, ValueError, OverflowError):
        return None
    if numeric < 0 or numeric > 2400:
        return None
    hhmm = f"{numeric:04d}"
    hour, minute = int(hhmm[:2]), int(hhmm[2:])
    if minute > 59:
        return None
    if hour == 24 and minute == 0:
        return datetime.combine(local_date + timedelta(days=1), time.min)
    if hour > 23:
        return None
    return datetime.combine(local_date, time(hour, minute))


def to_utc(local_dt: datetime | None, tz_name: str | None) -> datetime | None:
    """Convert a local wall time to UTC with deterministic DST handling."""
    if local_dt is None or not tz_name:
        return None
    zone = ZoneInfo(tz_name)
    candidate = local_dt.replace(tzinfo=zone, fold=0)
    round_trip = candidate.astimezone(timezone.utc).astimezone(zone)
    if round_trip.replace(tzinfo=None) == local_dt:
        return candidate.astimezone(timezone.utc)
    if round_trip.replace(tzinfo=None) > local_dt:
        return round_trip.astimezone(timezone.utc)
    return candidate.astimezone(timezone.utc)


def arrival_to_utc(
    clock_value: object,
    departure_local_date: date,
    tz_name: str | None,
    departure_utc: datetime | None,
    max_arrival_hours: int = 30,
) -> datetime | None:
    """Resolve arrival clock to the first plausible date on/after departure."""
    if departure_utc is None:
        return None
    for day_offset in range(2):
        local_dt = parse_clock(clock_value, departure_local_date + timedelta(days=day_offset))
        arrival_utc = to_utc(local_dt, tz_name)
        if arrival_utc is None:
            continue
        elapsed = (arrival_utc - departure_utc).total_seconds() / 3600
        if 0 <= elapsed <= max_arrival_hours:
            return arrival_utc
    return None


def dt_series(values: list[datetime | None]) -> pd.Series:
    """Convert optional datetimes into a UTC-aware pandas series."""
    return pd.to_datetime(pd.Series(values), utc=True)


def create_target(frame: pd.DataFrame, delay_column: str = "DEP_DELAY", threshold: int = 15) -> pd.DataFrame:
    """Add the binary departure-delay target without mutating the input frame."""
    result = frame.copy()
    result["DEP_DEL15"] = result[delay_column].ge(threshold).astype("int8")
    return result


def create_flight_pairs(
    flights: pd.DataFrame,
    max_turnaround_hours: int = 24,
) -> pd.DataFrame:
    """Link consecutive operated flights by tail and matching airport handoff."""
    required = {
        "TAIL_NUM", "ACTUAL_DEP_UTC", "ACTUAL_ARR_UTC", "SCHEDULED_DEP_UTC",
        "SCHEDULED_ARR_UTC", "DEP_DELAY", "ARR_DELAY_NEW", "CANCELLED", "DIVERTED",
        "DEST", "ORIGIN", "FLIGHT_DATE", "OP_CARRIER_FL_NUM",
    }
    missing = sorted(required - set(flights.columns))
    if missing:
        raise ValueError(f"Missing columns for flight pairing: {missing}")
    events = flights.loc[flights["TAIL_NUM"].notna() & flights["ACTUAL_DEP_UTC"].notna()].copy()
    events = events.sort_values(
        ["TAIL_NUM", "ACTUAL_DEP_UTC", "FLIGHT_DATE", "OP_CARRIER_FL_NUM"], kind="mergesort"
    ).reset_index(drop=True)
    grouped = events.groupby("TAIL_NUM", sort=False)
    for source, output in (
        ("DEST", "PREV_DEST"), ("FLIGHT_DATE", "PREV_FLIGHT_DATE"),
        ("OP_CARRIER_FL_NUM", "PREV_FLIGHT_NUM"), ("SCHEDULED_ARR_UTC", "PREV_SCHEDULED_ARR_UTC"),
        ("ACTUAL_ARR_UTC", "PREV_ACTUAL_ARR_UTC"), ("ARR_DELAY_NEW", "PREV_ARR_DELAY_MIN"),
        ("CANCELLED", "PREV_CANCELLED"), ("DIVERTED", "PREV_DIVERTED"),
    ):
        events[output] = grouped[source].shift(1)
    events["SCHEDULED_TURNAROUND_SLACK_MIN"] = (
        events["SCHEDULED_DEP_UTC"] - events["PREV_SCHEDULED_ARR_UTC"]
    ).dt.total_seconds() / 60
    events["ACTUAL_TURNAROUND_MIN"] = (
        events["ACTUAL_DEP_UTC"] - events["PREV_ACTUAL_ARR_UTC"]
    ).dt.total_seconds() / 60
    valid = (
        events["CANCELLED"].eq(0) & events["DIVERTED"].eq(0)
        & events["DEP_DELAY"].notna() & events["ACTUAL_ARR_UTC"].notna()
        & events["SCHEDULED_ARR_UTC"].notna() & events["PREV_DEST"].eq(events["ORIGIN"])
        & events["PREV_CANCELLED"].eq(0) & events["PREV_DIVERTED"].eq(0)
        & events["PREV_ARR_DELAY_MIN"].notna() & events["PREV_ACTUAL_ARR_UTC"].notna()
        & events["PREV_SCHEDULED_ARR_UTC"].notna()
        & events["SCHEDULED_TURNAROUND_SLACK_MIN"].between(0, max_turnaround_hours * 60)
        & events["ACTUAL_TURNAROUND_MIN"].between(0, max_turnaround_hours * 60)
    )
    return create_target(events.loc[valid].copy())
