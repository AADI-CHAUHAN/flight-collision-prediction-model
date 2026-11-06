# Day 1 — Scope and data inventory

## Day 1 status: complete

The BTS data has been downloaded and checked. The project scope is now narrow enough for a one-week build.

## Locked project scope

**Working title:** The Flight Delay Domino Effect  
**Research question:** When a Southwest aircraft arrives late, can we predict whether its next operated flight will depart at least 15 minutes late? How do model-based risk estimates change in a simplified added-turnaround-slack scenario?

**Study population:** Southwest Airlines (BTS carrier code `WN`), U.S. domestic flights, January–April 2026. Use all airports for WN so aircraft can be followed across its network.

**Prediction unit:** One operated flight with a preceding flight on the same aircraft tail number.

**Primary target:** Whether the current/next flight's `DEP_DELAY` is at least 15 minutes. Create `DEP_DEL15 = 1` when `DEP_DELAY >= 15`; otherwise set it to 0. Exclude cancelled flights and records without a usable aircraft tail number from the primary aircraft-sequence classifier. Discuss cancellations separately as disruption context.

**Main predictors:** Previous flight's arrival delay (`ARR_DELAY_NEW`), planned turnaround slack calculated from the previous scheduled arrival and the next scheduled departure, route, departure hour, day of week, and month. Do not use the next flight's actual delay, actual arrival, or post-event delay-cause fields as predictors.

**Project boundary:** This is retrospective analysis and a simplified simulation. It does not predict a new in-air route or prove that an airline could implement a schedule change.

## Source and files

Primary source: [BTS Reporting Carrier On-Time Performance](https://transtats.bts.gov/TableInfo.asp?QO_fu146_anzr=b0-gvzr&V0s1_b0yB=D&gnoyr_VQ=FGJ). The source reports individual domestic flight records and includes scheduled/actual times, cancellations/diversions, tail numbers, and delay fields.

| Month | Extracted CSV | Rows | File size |
|---|---|---:|---:|
| January 2026 | `T_ONTIME_REPORTING_20261027_145650/T_ONTIME_REPORTING.csv` | 544,003 | 60,284,718 bytes |
| February 2026 | `T_ONTIME_REPORTING_20261027_145800/T_ONTIME_REPORTING.csv` | 515,037 | 57,371,990 bytes |
| March 2026 | `T_ONTIME_REPORTING_20261027_150025/T_ONTIME_REPORTING.csv` | 612,102 | 68,192,579 bytes |
| April 2026 | `T_ONTIME_REPORTING_20261029_080530/T_ONTIME_REPORTING.csv` | 597,919 | 45,195,316 bytes |
| **Total** | **4 monthly CSV files** | **2,269,061** | **231,044,603 bytes** |

Each month also has its original BTS ZIP file in the project root. Keep the ZIP files and extracted CSV files unchanged as raw source data; perform filtering and cleaning on working copies.

## Verified data quality and suitability

- All four files cover the consecutive months January-April 2026.
- The January-March files have 23 columns; April has 17 selected core columns. All fields required by the pipeline are present in April; optional precomputed fields `DEP_DELAY_NEW` and `ARR_DEL15` are absent there, and the target is derived from `DEP_DELAY`.
- For WN across all four months: 444,897 total records, 5,969 cancellations, 798 diversions, 808 distinct aircraft tails, and 423,660 valid linked aircraft-flight pairs after time and continuity checks.
- No exact duplicate rows were found in the January-March sample or the April file when checked separately.

## Selected columns and notes

The January-March files contain these 23 fields:

`YEAR`, `MONTH`, `DAY_OF_MONTH`, `OP_UNIQUE_CARRIER`, `TAIL_NUM`, `OP_CARRIER_FL_NUM`, `ORIGIN_AIRPORT_ID`, `ORIGIN`, `DEST_AIRPORT_ID`, `DEST_AIRPORT_SEQ_ID`, `DEST_CITY_MARKET_ID`, `DEST`, `CRS_DEP_TIME`, `DEP_TIME`, `DEP_DELAY`, `DEP_DELAY_NEW`, `CRS_ARR_TIME`, `ARR_TIME`, `ARR_DELAY_NEW`, `ARR_DEL15`, `CANCELLED`, `CANCELLATION_CODE`, `DIVERTED`.

April contains the essential fields for date, carrier, tail, flight number, route, scheduled/actual departure and arrival times, delay, cancellation, and diversion. It omits some optional IDs and flags present in earlier months. The required route codes `ORIGIN` and `DEST` are present. The departure threshold flag is derived from `DEP_DELAY`. `ARR_DELAY_NEW` is the non-negative arrival delay in minutes; early arrivals are recorded as zero. Taxi times and delay-cause minutes are not required for this MVP.

## Timestamp and time-zone handling

BTS scheduled and actual clock times are local to each airport, so raw HHMM values cannot be sorted across airports directly. Day 2 used the `airportsdata` 20260905 package to map the first 106 IATA airport codes in WN's sample to IANA timezone names, then added STS for April using the airport's published local-time information. The frozen 107-airport mapping is in `data/reference/airport_timezones.csv`; its provenance is documented in `data/reference/README.md`.

The preprocessing script handles `2400` as midnight on the following date, rolls arrivals to the earliest plausible local date after departure, and shifts nonexistent spring-forward clock times forward. It consistently chooses the first occurrence for an ambiguous repeated clock time. Inspect the generated sample chains in the Day 2 report when changing or extending this time logic.

## Day 1 decisions and deliverables

- **Decision:** use WN as the pilot carrier. It has the largest record count in this sample and enough repeated aircraft records for sequence analysis.
- **Decision:** extend the study period to four months and retain all WN airports; filter other carriers after loading the data.
- **Decision:** define the main classification target as next-flight departure delay of 15+ minutes.
- **Completed:** checked file coverage, row counts, schema consistency, missing tail numbers, cancellations, diversions, exact duplicates, and WN tail-number coverage.
- **Completed:** documented a time-zone conversion approach and fallback.

## Day 2 starting checklist

1. Load the four CSVs and filter to `OP_UNIQUE_CARRIER == "WN"`.
2. Parse `YEAR`, `MONTH`, and `DAY_OF_MONTH` into the local flight date; parse HHMM clock fields carefully.
3. Join origin and destination airport time zones and create UTC departure/arrival timestamps.
4. Exclude cancelled flights from the operated-flight sequence; retain a separate cancellation summary.
5. Sort by tail number and UTC event time, create previous-flight/next-flight pairs, and manually inspect at least 10 chains.
6. Derive `DEP_DEL15` and turnaround slack; save a cleaned pair-level file separately from the raw data.

