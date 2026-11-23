"""Generate threshold, calibration, scenario, and explanation dashboard data."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from src.config import ProjectConfig, default_config
from src.features import add_engineered_features


BUFFERS = (0, 5, 10, 15, 20, 30, 45, 60)
NUMERIC = ["PREV_ARR_DELAY_LOG1P", "SCHEDULED_SLACK_LOG1P", "SHORT_SLACK_LT_60", "PREV_DELAY_X_SHORT_SLACK", "DEPARTURE_HOUR_SIN", "DEPARTURE_HOUR_COS"]
CATEGORICAL = ["ORIGIN", "DEST", "DAY_OF_WEEK"]
MODEL_FEATURES = NUMERIC + CATEGORICAL
FEATURE_LABELS = {
    "PREV_ARR_DELAY_LOG1P": "Previous arrival delay",
    "SCHEDULED_SLACK_LOG1P": "Turnaround slack",
    "SHORT_SLACK_LT_60": "Short turnaround",
    "PREV_DELAY_X_SHORT_SLACK": "Previous delay × short turnaround",
    "DEPARTURE_HOUR_SIN": "Departure time cycle",
    "DEPARTURE_HOUR_COS": "Departure time cycle",
    "ORIGIN": "Origin airport",
    "DEST": "Destination airport",
    "DAY_OF_WEEK": "Day of week",
}


def _records(frame: pd.DataFrame, columns: list[str]) -> list[dict]:
    out = frame[columns].copy()
    for column in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[column]):
            out[column] = out[column].dt.strftime("%Y-%m-%dT%H:%M:%S%z")
    if "FLIGHT_DATE" in out.columns:
        out["FLIGHT_DATE"] = pd.to_datetime(out["FLIGHT_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")
    return json.loads(out.to_json(orient="records"))


def _model() -> Pipeline:
    preprocess = ColumnTransformer([
        ("numeric", Pipeline([("imputer", SimpleImputer(strategy="median"))]), NUMERIC),
        ("categorical", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore", min_frequency=50))]), CATEGORICAL),
    ], remainder="drop")
    return Pipeline([("preprocess", preprocess), ("classifier", RandomForestClassifier(n_estimators=120, max_depth=14, min_samples_leaf=40, max_features="sqrt", class_weight="balanced_subsample", n_jobs=-1, random_state=42))])


def _scenario_frame(frame: pd.DataFrame, extra: int) -> pd.DataFrame:
    result = frame.copy()
    result["SCHEDULED_TURNAROUND_SLACK_MIN"] = pd.to_numeric(result["SCHEDULED_TURNAROUND_SLACK_MIN"], errors="coerce") + extra
    return add_engineered_features(result)


def _threshold_metrics(scores: np.ndarray, actual: np.ndarray) -> pd.DataFrame:
    rows = []
    for threshold in np.round(np.arange(0.05, 1.0, 0.05), 2):
        predicted = scores >= threshold
        tp = int((predicted & (actual == 1)).sum()); fp = int((predicted & (actual == 0)).sum())
        tn = int((~predicted & (actual == 0)).sum()); fn = int((~predicted & (actual == 1)).sum())
        precision = tp / (tp + fp) if tp + fp else 0.0; recall = tp / (tp + fn) if tp + fn else 0.0
        rows.append({"THRESHOLD": float(threshold), "PRECISION": precision, "RECALL": recall, "F1": 2 * precision * recall / (precision + recall) if precision + recall else 0.0, "ACCURACY": (tp + tn) / len(actual), "TP": tp, "FP": fp, "TN": tn, "FN": fn, "PREDICTED_DELAY_COUNT": int(predicted.sum())})
    return pd.DataFrame(rows)


def _group_feature_values(model: Pipeline, frame: pd.DataFrame) -> tuple[list[str], np.ndarray]:
    """Return transformed feature names and values for explainability exports."""
    preprocessor = model.named_steps["preprocess"]
    explain_frame = frame
    if not set(MODEL_FEATURES).issubset(explain_frame.columns):
        explain_frame = explain_frame.copy()
        previous_delay = pd.to_numeric(explain_frame["PREV_ARR_DELAY_MIN"], errors="coerce").clip(lower=0)
        slack = pd.to_numeric(explain_frame["SCHEDULED_TURNAROUND_SLACK_MIN"], errors="coerce").clip(lower=0)
        hour = pd.to_numeric(explain_frame["DEPARTURE_HOUR_LOCAL"], errors="coerce")
        explain_frame["PREV_ARR_DELAY_LOG1P"] = np.log1p(previous_delay)
        explain_frame["SCHEDULED_SLACK_LOG1P"] = np.log1p(slack)
        explain_frame["SHORT_SLACK_LT_60"] = (slack < 60).astype("int8")
        explain_frame["PREV_DELAY_X_SHORT_SLACK"] = explain_frame["PREV_ARR_DELAY_LOG1P"] * explain_frame["SHORT_SLACK_LT_60"]
        explain_frame["DEPARTURE_HOUR_SIN"] = np.sin(2 * np.pi * hour / 24)
        explain_frame["DEPARTURE_HOUR_COS"] = np.cos(2 * np.pi * hour / 24)
    transformed = preprocessor.transform(explain_frame[MODEL_FEATURES])
    if hasattr(transformed, "toarray"):
        transformed = transformed.toarray()
    return list(preprocessor.get_feature_names_out()), np.asarray(transformed)


def _group_shap_values(feature_names: list[str], values: np.ndarray) -> dict[str, float]:
    grouped: dict[str, float] = {feature: 0.0 for feature in MODEL_FEATURES}
    for name, value in zip(feature_names, values):
        raw = name.split("__", 1)[-1]
        feature = next((item for item in MODEL_FEATURES if raw == item or raw.startswith(item + "_")), raw)
        grouped[feature] = grouped.get(feature, 0.0) + float(value)
    return grouped


def _reason_fields(grouped: dict[str, float], limit: int = 3) -> dict[str, object]:
    ordered = sorted(grouped.items(), key=lambda item: abs(item[1]), reverse=True)
    increasing = [(FEATURE_LABELS.get(key, key), value) for key, value in ordered if value > 0][:limit]
    reducing = [(FEATURE_LABELS.get(key, key), value) for key, value in ordered if value < 0][:limit]
    code = lambda label, value: f"{label} ({value:+.3f})"
    return {
        "REASON_CODES": "; ".join(code(label, value) for label, value in ordered[:limit]),
        "MAIN_FACTORS_INCREASING_RISK": "; ".join(code(label, value) for label, value in increasing) or "None identified",
        "MAIN_FACTORS_REDUCING_RISK": "; ".join(code(label, value) for label, value in reducing) or "None identified",
    }


def _grouped_scenarios(april: pd.DataFrame, outputs: dict[int, dict], columns: list[str]) -> pd.DataFrame:
    blocks = []
    for extra in BUFFERS:
        block = april[columns].copy()
        block["MODEL_SCORE"] = outputs[extra]["score"]
        block["MODEL_FLAG"] = outputs[extra]["flag"]
        block["RULE_RESIDUAL_DELAY_MIN"] = outputs[extra]["residual"]
        grouped = block.groupby(columns, dropna=False).agg(MEAN_MODEL_SCORE=("MODEL_SCORE", "mean"), MEDIAN_MODEL_SCORE=("MODEL_SCORE", "median"), NUMBER_PREDICTED_DELAYS=("MODEL_FLAG", "sum"), MEAN_RULE_RESIDUAL_DELAY_MIN=("RULE_RESIDUAL_DELAY_MIN", "mean")).reset_index()
        grouped["EXTRA_SCHEDULED_SLACK_MIN"] = extra
        blocks.append(grouped)
    return pd.concat(blocks, ignore_index=True)


def generate_dashboard(config: ProjectConfig | None = None) -> dict:
    config = config or default_config()
    report_dir = config.root / "reports" / "metrics"
    pairs = pd.read_csv(config.processed_dir / "wn_aircraft_pairs_2026-01_to_2026-04.csv", low_memory=False, parse_dates=["FLIGHT_DATE"])
    pairs["FLIGHT_DATE"] = pd.to_datetime(pairs["FLIGHT_DATE"], errors="coerce")
    pairs = pairs.dropna(subset=["FLIGHT_DATE", "DEP_DEL15"]).copy(); pairs["DEP_DEL15"] = pairs["DEP_DEL15"].astype(int)
    validation = pd.read_csv(report_dir / "day3_model_validation_comparison.csv")
    threshold = float(validation.loc[validation["MODEL"].eq("Engineered random forest"), "SELECTED_THRESHOLD"].iloc[0])
    april = pairs.loc[pairs["FLIGHT_DATE"] >= pd.Timestamp("2026-04-01")].copy()
    train = pairs.loc[pairs["FLIGHT_DATE"] < pd.Timestamp("2026-04-01")].copy()
    model = _model(); model.fit(add_engineered_features(train)[MODEL_FEATURES], train["DEP_DEL15"])
    outputs = {}
    for extra in BUFFERS:
        score = model.predict_proba(_scenario_frame(april, extra)[MODEL_FEATURES])[:, 1]
        residual = np.maximum(0, april["PREV_ARR_DELAY_MIN"].to_numpy() - (april["SCHEDULED_TURNAROUND_SLACK_MIN"].to_numpy() + extra))
        outputs[extra] = {"score": score, "residual": residual, "rule": (residual >= 15).astype(int), "flag": (score >= threshold).astype(int)}
    actual = april["DEP_DEL15"].to_numpy(dtype=int); baseline = outputs[0]["score"]; baseline_flag = outputs[0]["flag"]
    explain_sample = april.sample(min(5000, len(april)), random_state=42)
    permutation_frame = _scenario_frame(explain_sample, 0)[MODEL_FEATURES]
    permutation_importance_frame = pd.DataFrame()
    try:
        permutation = permutation_importance(model, permutation_frame, explain_sample["DEP_DEL15"], scoring="roc_auc", n_repeats=5, random_state=42, n_jobs=-1)
        permutation_importance_frame = pd.DataFrame({"FEATURE": MODEL_FEATURES, "FEATURE_LABEL": [FEATURE_LABELS.get(item, item) for item in MODEL_FEATURES], "MEAN_IMPORTANCE": permutation.importances_mean, "STD_IMPORTANCE": permutation.importances_std}).sort_values("MEAN_IMPORTANCE", ascending=False)
        permutation_importance_frame.to_csv(report_dir / "day5_permutation_importance.csv", index=False)
    except Exception as exc:
        print(f"Permutation importance unavailable: {exc}")
    shap_importance_frame = pd.DataFrame()
    shap_explainer = None
    try:
        import shap
        transformed_names, transformed_values = _group_feature_values(model, explain_sample)
        shap_explainer = shap.TreeExplainer(model.named_steps["classifier"])
        shap_output = shap_explainer.shap_values(transformed_values)
        shap_values = np.asarray(shap_output[1] if isinstance(shap_output, list) else shap_output)
        if shap_values.ndim == 3:
            shap_values = shap_values[:, :, 1]
        shap_rows = []
        for feature in MODEL_FEATURES:
            grouped_values = [_group_shap_values(transformed_names, row)[feature] for row in shap_values]
            shap_rows.append({"FEATURE": feature, "FEATURE_LABEL": FEATURE_LABELS.get(feature, feature), "MEAN_ABS_SHAP": float(np.mean(np.abs(grouped_values))), "MEAN_SHAP": float(np.mean(grouped_values))})
        shap_importance_frame = pd.DataFrame(shap_rows).sort_values("MEAN_ABS_SHAP", ascending=False)
        shap_importance_frame.to_csv(report_dir / "day5_shap_feature_importance.csv", index=False)
    except Exception as exc:
        print(f"SHAP importance unavailable: {exc}")
    summary_scores = np.column_stack([outputs[extra]["score"] for extra in BUFFERS])
    monotonic_non_increasing = np.all(np.diff(summary_scores, axis=1) <= 1e-12, axis=1)
    summaries = []
    for extra in BUFFERS:
        out = outputs[extra]
        summaries.append({"EXTRA_SCHEDULED_SLACK_MIN": extra, "MEAN_MODEL_SCORE": float(out["score"].mean()), "MEDIAN_MODEL_SCORE": float(np.median(out["score"])), "SHARE_SCORE_LOWER_THAN_BASELINE": float(np.mean(out["score"] < baseline - 1e-12)), "SHARE_MODEL_ALERT_AT_LOCKED_THRESHOLD": float(out["flag"].mean()), "NUMBER_PREDICTED_DELAYS": int(out["flag"].sum()), "MEAN_RULE_RESIDUAL_DELAY_MIN": float(out["residual"].mean()), "SHARE_RULE_FLAGS_DELAYED": float(out["rule"].mean()), "SHARE_PREDICTION_CHANGED_FROM_BASELINE": float(np.mean(out["flag"] != baseline_flag)), "MODEL_RULE_AGREEMENT": float(np.mean(out["flag"] == out["rule"])), "SHARE_FLIGHTS_MONOTONIC_NON_INCREASING": float(monotonic_non_increasing.mean())})
    scenario_summary = pd.DataFrame(summaries); scenario_summary.to_csv(report_dir / "day5_scenario_impact_summary.csv", index=False)
    slack_bins = [-np.inf, 30, 60, 90, 120, 180, np.inf]
    slack_labels = ["<30", "30–59", "60–89", "90–119", "120–179", "180+"]
    empirical = april.assign(TURNAROUND_SLACK_BAND=pd.cut(april["SCHEDULED_TURNAROUND_SLACK_MIN"], bins=slack_bins, labels=slack_labels, right=False), BASELINE_MODEL_SCORE=baseline)
    empirical_comparison = empirical.groupby("TURNAROUND_SLACK_BAND", observed=False).agg(FLIGHT_COUNT=("DEP_DEL15", "size"), EMPIRICAL_DELAY_RATE=("DEP_DEL15", "mean"), MEAN_ACTUAL_DEPARTURE_DELAY_MIN=("DEP_DELAY_MIN", "mean"), MEAN_BASELINE_MODEL_SCORE=("BASELINE_MODEL_SCORE", "mean")).reset_index()
    empirical_comparison.to_csv(report_dir / "day5_empirical_turnaround_comparison.csv", index=False)
    candidate = april.loc[(april["PREV_ARR_DELAY_MIN"] >= 30) & (april["SCHEDULED_TURNAROUND_SLACK_MIN"] <= 120)]
    eligible = candidate.groupby("TAIL_NUM").size(); eligible = eligible[eligible >= 3].index
    if len(eligible) == 0: eligible = april.groupby("TAIL_NUM").size(); eligible = eligible[eligible >= 3].index
    score_series = pd.Series(baseline, index=april.index)
    windows = []
    for tail in sorted(eligible):
        tail_rows = april.loc[april["TAIL_NUM"].eq(tail)].sort_values(["FLIGHT_DATE", "SCHEDULED_DEP_UTC"])
        qualifying = tail_rows.loc[(tail_rows["PREV_ARR_DELAY_MIN"] >= 30) & (tail_rows["SCHEDULED_TURNAROUND_SLACK_MIN"] <= 120)]
        start = 0
        if not qualifying.empty:
            anchor = score_series.loc[qualifying.index].idxmax(); start = max(0, tail_rows.index.get_loc(anchor) - 1)
        window = tail_rows.iloc[start:start + 4]; windows.append(window if len(window) >= 3 else tail_rows.head(4))
    keys = pd.concat([window[["FLIGHT_DATE", "TAIL_NUM", "FLIGHT_NUM"]] for window in windows], ignore_index=True).drop_duplicates()
    scenario_rows = []
    base_columns = ["FLIGHT_DATE", "TAIL_NUM", "PREV_FLIGHT_DATE", "PREV_FLIGHT_NUM", "PREV_ORIGIN", "PREV_DEST", "PREV_ACTUAL_ARR_UTC", "PREV_SCHEDULED_ARR_UTC", "PREV_ARR_DELAY_MIN", "SCHEDULED_TURNAROUND_SLACK_MIN", "FLIGHT_NUM", "ORIGIN", "DEST", "SCHEDULED_DEP_UTC", "ACTUAL_DEP_UTC", "DEP_DELAY_MIN", "DEP_DEL15"]
    for extra in BUFFERS:
        block = april[base_columns].copy(); out = outputs[extra]; block["EXTRA_SCHEDULED_SLACK_MIN"] = extra; block["MODEL_RELATIVE_SCORE"] = out["score"]; block["MODEL_ALERT_AT_LOCKED_THRESHOLD"] = out["flag"]; block["RULE_RESIDUAL_DELAY_MIN"] = out["residual"]; block["RULE_FLAGS_DELAYED"] = out["rule"]; scenario_rows.append(block)
    chain = pd.concat(scenario_rows, ignore_index=True).merge(keys, on=["FLIGHT_DATE", "TAIL_NUM", "FLIGHT_NUM"], how="inner")
    calibration_rows = []
    edges = np.linspace(0, 1, 11)
    for lower, upper in zip(edges[:-1], edges[1:]):
        mask = (baseline >= lower) & ((baseline < upper) if upper < 1 else (baseline <= upper))
        if mask.any(): calibration_rows.append({"BUCKET": f"{lower:.1f}-{upper:.1f}", "MEAN_PREDICTED_SCORE": float(baseline[mask].mean()), "OBSERVED_DELAY_RATE": float(actual[mask].mean()), "COUNT": int(mask.sum())})
    calibration = pd.DataFrame(calibration_rows)
    reference = {"PREV_ARR_DELAY_MIN": float(april["PREV_ARR_DELAY_MIN"].median()), "SCHEDULED_TURNAROUND_SLACK_MIN": float(april["SCHEDULED_TURNAROUND_SLACK_MIN"].median()), "ORIGIN": str(april["ORIGIN"].mode().iloc[0]), "DEST": str(april["DEST"].mode().iloc[0]), "DEPARTURE_HOUR_LOCAL": float(april["DEPARTURE_HOUR_LOCAL"].median()), "DAY_OF_WEEK": int(april["DAY_OF_WEEK"].mode().iloc[0])}
    indices = sorted({index for window in windows for index in window.index})
    selected = april.loc[indices].copy()
    counterfactuals = []
    for label, columns in {"Previous arrival delay": ["PREV_ARR_DELAY_MIN"], "Turnaround slack": ["SCHEDULED_TURNAROUND_SLACK_MIN"], "Route": ["ORIGIN", "DEST"], "Departure time": ["DEPARTURE_HOUR_LOCAL", "DAY_OF_WEEK"]}.items():
        counter = selected.copy()
        for column in columns: counter[column] = reference[column]
        counterfactuals.append((label, counter))
    counter_scores = {}
    for label, counter in counterfactuals:
        counter_scores[label] = model.predict_proba(add_engineered_features(counter)[MODEL_FEATURES])[:, 1]
    if shap_explainer is not None:
        selected_names, selected_transformed = _group_feature_values(model, selected)
        selected_shap_output = shap_explainer.shap_values(selected_transformed)
        selected_shap_values = np.asarray(selected_shap_output[1] if isinstance(selected_shap_output, list) else selected_shap_output)
        if selected_shap_values.ndim == 3:
            selected_shap_values = selected_shap_values[:, :, 1]
    else:
        selected_names, selected_shap_values = [], None
    explanations = []
    for position, index in enumerate(indices):
        score = float(score_series.loc[index]); contributions = {label: score - float(values[position]) for label, values in counter_scores.items()}
        dominant = max(contributions, key=lambda item: abs(contributions[item])); pred = int(score >= threshold); truth = int(selected.iloc[position]["DEP_DEL15"])
        row = selected.iloc[position]
        shap_grouped = _group_shap_values(selected_names, selected_shap_values[position]) if selected_shap_values is not None else {}
        reasons = _reason_fields(shap_grouped) if shap_grouped else {"REASON_CODES": "", "MAIN_FACTORS_INCREASING_RISK": "", "MAIN_FACTORS_REDUCING_RISK": ""}
        explanations.append({"FLIGHT_DATE": row["FLIGHT_DATE"], "TAIL_NUM": row["TAIL_NUM"], "FLIGHT_NUM": row["FLIGHT_NUM"], "ORIGIN": row["ORIGIN"], "DEST": row["DEST"], "SCHEDULED_DEP_UTC": row["SCHEDULED_DEP_UTC"], "MODEL_SCORE": score, "MODEL_RESULT_AT_LOCKED_THRESHOLD": pred, "ACTUAL_DELAYED": truth, "RESULT_CORRECT": int(pred == truth), "PREVIOUS_ARRIVAL_DELAY_CONTRIBUTION": contributions["Previous arrival delay"], "TURNAROUND_SLACK_CONTRIBUTION": contributions["Turnaround slack"], "ROUTE_CONTRIBUTION": contributions["Route"], "DEPARTURE_TIME_CONTRIBUTION": contributions["Departure time"], "DOMINANT_SENSITIVITY": dominant, "EXPLANATION": f"Stored score is {'high' if pred else 'low'}; largest local sensitivity is {dominant.lower()}.", **reasons})
    explanation_frame = pd.DataFrame(explanations)
    explanation_frame.to_csv(report_dir / "day5_dashboard_explanations.csv", index=False)
    importance = pd.DataFrame({"ORIGINAL_FEATURE": MODEL_FEATURES, "IMPORTANCE": [0.0] * len(MODEL_FEATURES)})
    encoded = model.named_steps["preprocess"].get_feature_names_out(); values = model.named_steps["classifier"].feature_importances_; grouped = {}
    for name, value in zip(encoded, values):
        raw = name.split("__", 1)[-1]; key = next((feature for feature in MODEL_FEATURES if raw == feature or raw.startswith(feature + "_")), raw); grouped[key] = grouped.get(key, 0.0) + float(value)
    importance = pd.DataFrame([{"ORIGINAL_FEATURE": key, "IMPORTANCE": value} for key, value in grouped.items()]).sort_values("IMPORTANCE", ascending=False)
    scatter_source = april[["PREV_ARR_DELAY_MIN", "DEP_DELAY_MIN", "SCHEDULED_TURNAROUND_SLACK_MIN", "FLIGHT_NUM", "ORIGIN", "DEST", "TAIL_NUM", "FLIGHT_DATE"]].copy()
    for column in ("PREV_ARR_DELAY_MIN", "DEP_DELAY_MIN"):
        scatter_source[column] = pd.to_numeric(scatter_source[column], errors="coerce")
    scatter_source = scatter_source.dropna(subset=["PREV_ARR_DELAY_MIN", "DEP_DELAY_MIN"])
    step = max(1, len(scatter_source) // 1100); scatter = scatter_source.iloc[::step].head(1100).rename(columns={"PREV_ARR_DELAY_MIN": "x", "DEP_DELAY_MIN": "y", "SCHEDULED_TURNAROUND_SLACK_MIN": "slack", "FLIGHT_NUM": "flight", "ORIGIN": "from", "DEST": "to", "TAIL_NUM": "tail", "FLIGHT_DATE": "date"})
    quality_path = report_dir / "day2_dashboard_quality.json"
    quality = json.loads(quality_path.read_text(encoding="utf-8")) if quality_path.is_file() else {}
    airport_names = pd.read_csv(config.timezone_file, dtype=str).set_index("airport_code")["airport_name"].to_dict()
    data = {"airportNames": airport_names, "scatter": _records(scatter, list(scatter.columns)), "scatterCount": int(len(scatter_source)), "scatterStep": int(step), "chain": _records(chain, list(chain.columns)), "importance": _records(importance, ["ORIGINAL_FEATURE", "IMPORTANCE"]), "permutationImportance": _records(permutation_importance_frame, list(permutation_importance_frame.columns)), "shapImportance": _records(shap_importance_frame, list(shap_importance_frame.columns)), "populationScenarios": _records(scenario_summary, list(scenario_summary.columns)), "empiricalTurnaround": _records(empirical_comparison, list(empirical_comparison.columns)), "scenarioMonotonicShare": float(monotonic_non_increasing.mean()), "thresholdMetrics": _records(_threshold_metrics(baseline, actual), list(_threshold_metrics(baseline, actual).columns)), "calibration": _records(calibration, list(calibration.columns)), "brierScore": float(np.mean((baseline - actual) ** 2)), "riskBuckets": _records(calibration.rename(columns={"BUCKET": "RISK_BUCKET", "MEAN_PREDICTED_SCORE": "MEAN_SCORE"}), ["RISK_BUCKET", "MEAN_SCORE", "OBSERVED_DELAY_RATE", "COUNT"]), "explanations": _records(explanation_frame, list(explanation_frame.columns)), "quality": quality}
    for name, columns in [("scenarioByAirport", ["ORIGIN"]), ("scenarioByRoute", ["ORIGIN", "DEST"]), ("scenarioByTail", ["TAIL_NUM"])]:
        grouped = _grouped_scenarios(april, outputs, columns); data[name] = _records(grouped, list(grouped.columns)); grouped.to_csv(report_dir / f"day5_scenario_by_{'route' if name.endswith('Route') else 'airport' if name.endswith('Airport') else 'tail'}.csv", index=False)
    config.dashboard_data_file.write_text("window.DASHBOARD_DATA = " + json.dumps(data, separators=(",", ":"), allow_nan=False) + ";\n", encoding="utf-8")
    return data


if __name__ == "__main__":
    result = generate_dashboard(); print(f"Dashboard export written: {len(result['chain'])} chain rows, {len(result['explanations'])} explanations")
