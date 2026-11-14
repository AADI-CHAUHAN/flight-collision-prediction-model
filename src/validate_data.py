"""Validate the local data handoff before running notebooks."""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from src.config import ProjectConfig, default_config
from src.preprocessing import normalize_bts_columns


REQUIRED_RAW_COLUMNS = {
    "YEAR", "MONTH", "DAY_OF_MONTH", "OP_UNIQUE_CARRIER", "TAIL_NUM",
    "OP_CARRIER_FL_NUM", "ORIGIN", "DEST", "CRS_DEP_TIME", "DEP_TIME",
    "DEP_DELAY", "CRS_ARR_TIME", "ARR_TIME", "ARR_DELAY_NEW", "CANCELLED", "DIVERTED",
}


def validate_data(config: ProjectConfig, require_processed: bool = False) -> list[str]:
    """Return human-readable validation errors; do not modify project files."""
    errors: list[str] = []
    if not config.timezone_file.is_file():
        errors.append(f"Missing airport timezone lookup: {config.timezone_file}")
    else:
        airports = pd.read_csv(config.timezone_file)
        for column in ("airport_code", "timezone"):
            if column not in airports.columns:
                errors.append(f"Timezone lookup is missing column: {column}")

    raw_files = sorted(config.raw_dir.glob("*/On_Time_Reporting_Carrier_On_Time_Performance_*.csv"))
    raw_files += sorted(config.raw_dir.glob("T_ONTIME_REPORTING_*/T_ONTIME_REPORTING.csv"))
    raw_files = sorted(set(raw_files))
    if len(raw_files) != 4:
        errors.append(f"Expected 4 extracted BTS monthly files, found {len(raw_files)}")
    for path in raw_files:
        try:
            columns = set(normalize_bts_columns(pd.read_csv(path, nrows=0)).columns)
        except (OSError, pd.errors.ParserError) as exc:
            errors.append(f"Could not read {path}: {exc}")
            continue
        missing = sorted(REQUIRED_RAW_COLUMNS - columns)
        if missing:
            errors.append(f"{path.name} is missing columns: {', '.join(missing)}")

    processed = config.processed_dir / "wn_aircraft_pairs_2026-01_to_2026-04.csv"
    if require_processed and not processed.is_file():
        errors.append(f"Missing processed pair file: {processed}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, help="Project root; defaults to the detected repository")
    parser.add_argument("--require-processed", action="store_true", help="Also require the generated pair-level output")
    args = parser.parse_args()
    config = ProjectConfig(args.root.resolve()) if args.root else default_config()
    errors = validate_data(config, require_processed=args.require_processed)
    if errors:
        print("DATA VALIDATION FAILED")
        for error in errors:
            print(f"- {error}")
        return 1
    print("DATA VALIDATION PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
