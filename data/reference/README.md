# Airport time-zone lookup

`airport_timezones.csv` maps each IATA code used by Southwest (`WN`) in the BTS January–April 2026 sample to its airport name, city, and IANA time-zone name. It was generated on 2026-10-28 from the `airportsdata` Python package, version `20260905`. The package is MIT-licensed and publishes airport IATA codes, coordinates, and IANA-compatible `tz` values.

The Day 2 preprocessing notebook uses this frozen mapping and Python's standard-library `zoneinfo`; it does not need `airportsdata` at runtime. For April 2026, the lookup was extended with STS (Santa Rosa, California) using the airport local-time information; the official airport lists tower hours as 1500-0400Z and notes daylight-saving shifts. If the carrier or study period changes, extend the lookup, validate every BTS airport code, and record the source and access date.

Source: [airportsdata on PyPI](https://pypi.org/project/airportsdata/). The package maintainer notes that data is best-effort and does not guarantee accuracy. The project uses the mapping for time normalization, so inspect airport-code matches and resulting sample chains.

Added STS reference: [Charles M. Schulz-Sonoma County Airport pilot information](https://www.flysts.com/general-aviation/pilot-information/).
