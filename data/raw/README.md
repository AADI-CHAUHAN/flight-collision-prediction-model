# Raw BTS data setup

This directory is reserved for the extracted Bureau of Transportation Statistics Reporting Carrier On-Time Performance files used by the notebooks.

Download the January-April 2026 monthly extracts from the [BTS Reporting Carrier On-Time Performance source](https://transtats.bts.gov/TableInfo.asp?QO_fu146_anzr=b0-gvzr&V0s1_b0yB=D&gnoyr_VQ=FGJ). Keep the original downloads unchanged and extract each one into a folder. The current BTS download names are supported, for example:

```text
data/raw/
  On_Time_Reporting_Carrier_On_Time_Performance_1987_present_2026_1/
    On_Time_Reporting_Carrier_On_Time_Performance_(1987_present)_2026_1.csv
  ..._2026_2/
    ..._2026_2.csv
  ..._2026_3/
    ..._2026_3.csv
  ..._2026_4/
    ..._2026_4.csv
```

The preprocessing notebook also accepts the older `T_ONTIME_REPORTING_*/T_ONTIME_REPORTING.csv` layout. Current BTS headers such as `Tail_Number`, `DepDelay`, and `ArrDelayMinutes` are normalized automatically to the canonical names used by the notebooks. Raw datasets, archives, and other downloaded files are ignored by Git because of their size.

Start with [02_data_preprocessing.ipynb](../../notebooks/02_data_preprocessing.ipynb) after placing all four monthly extracts here.
