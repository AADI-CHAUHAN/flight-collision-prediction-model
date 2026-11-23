import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BUFFERS = [0, 5, 10, 15, 20, 30, 45, 60]


def load_dashboard_data():
    source = (ROOT / "dashboard" / "dashboard-data.js").read_text(encoding="utf-8")
    payload = source.split("=", 1)[1].strip().removesuffix(";")
    return json.loads(payload)


def test_dashboard_export_has_valid_scatter_and_population_scenarios():
    data = load_dashboard_data()
    assert len(data["scatter"]) > 0
    assert all(isinstance(point["x"], (int, float)) for point in data["scatter"])
    assert all(isinstance(point["y"], (int, float)) for point in data["scatter"])
    assert len(data["scatter"]) <= data["scatterCount"]
    assert [row["EXTRA_SCHEDULED_SLACK_MIN"] for row in data["populationScenarios"]] == BUFFERS


def test_each_exported_demo_leg_has_one_record_per_buffer():
    data = load_dashboard_data()
    groups = {}
    for row in data["chain"]:
        identity = (
            row["TAIL_NUM"], row["FLIGHT_DATE"], row["FLIGHT_NUM"],
            row["ORIGIN"], row["DEST"], row["SCHEDULED_DEP_UTC"],
        )
        groups.setdefault(identity, []).append(row["EXTRA_SCHEDULED_SLACK_MIN"])
    assert groups
    assert all(sorted(values) == BUFFERS for values in groups.values())


def test_dashboard_export_has_airport_and_explainability_metadata():
    data = load_dashboard_data()
    assert data["airportNames"]["BUF"] == "Buffalo Niagara International Airport"
    assert data["airportNames"]["BWI"] == "Baltimore/Washington International Thurgood Marshall Airport"
    assert data["importance"]
    assert {row["FEATURE"] for row in data["permutationImportance"]} == {
        row["FEATURE"] for row in data["shapImportance"]
    }
    assert data["explanations"]
    assert data["thresholdMetrics"]
    assert data["quality"]["missing_timestamp_values"] == 11952
