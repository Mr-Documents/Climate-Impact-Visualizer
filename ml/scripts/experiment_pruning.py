"""Does pruning survive grouped CV, or is it single-split noise?

analyse_models.py measures pruning on ONE validation split. That is the same
evidence that put logistic_regression ahead of random_forest on drought and was
overturned by grouped CV. Before acting on a +0.0298 drought gain, re-measure it
the way selection is measured: whole locations held out, six folds.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score
from sklearn.model_selection import GroupKFold

sys.path.insert(0, str(Path("src").resolve()))

from climate_ml import config
from climate_ml.data.assemble import (
    SPLIT_TRAIN,
    SPLIT_VALIDATION,
    assemble,
    model_features,
    training_frame,
)
from climate_ml.data.openmeteo import load_all
from climate_ml.models.candidates import build_candidates

DROPPED = {
    "flood": ["precip_90d", "soil_change_30d", "precip_max_1d_in_30d",
              "temp_anomaly", "water_balance_90d", "soil_change_7d"],
    "drought": ["precip_max_1d_in_7d", "precip_7d", "precip_1d", "consecutive_wet_days"],
}
TARGETS = {"flood": "y_flood", "drought": "y_drought"}

table = assemble(load_all())
features = model_features(table)
out = {}

for target, column in TARGETS.items():
    frame = training_frame(table, column)
    window = config.TRAINING_WINDOW[target]
    train = frame[frame["split"] == SPLIT_TRAIN]
    train = train[train["year"] >= window["first_year"]]
    val = frame[frame["split"] == SPLIT_VALIDATION]
    combined = pd.concat([train, val], ignore_index=True)

    y = combined[column].to_numpy().astype(int)
    groups = combined["location_id"].to_numpy()
    keep = [f for f in features if f not in DROPPED[target]]

    weight = None
    if window["half_life_years"] is not None:
        age = config.TRAIN_END_YEAR - train["year"].to_numpy()
        weight = np.concatenate([
            0.5 ** (age / window["half_life_years"]), np.ones(len(val))
        ])

    splits = list(GroupKFold(n_splits=config.SPATIAL_FOLDS).split(
        combined[features].to_numpy(), y, groups))

    res = {}
    for label, cols in (("full", features), ("pruned", keep)):
        x = combined[cols].to_numpy()
        fold_scores = []
        for tr, te in splits:
            if y[tr].sum() == 0 or y[te].sum() == 0:
                continue
            est = next(c for c in build_candidates() if c.name == "random_forest").estimator
            if weight is not None:
                est.fit(x[tr], y[tr], sample_weight=weight[tr])
            else:
                est.fit(x[tr], y[tr])
            fold_scores.append(average_precision_score(y[te], est.predict_proba(x[te])[:, 1]))
        res[label] = {
            "mean": round(float(np.mean(fold_scores)), 4),
            "sd": round(float(np.std(fold_scores)), 4),
            "folds": [round(float(v), 4) for v in fold_scores],
            "n_features": len(cols),
        }

    wins = sum(p > f for p, f in zip(res["pruned"]["folds"], res["full"]["folds"]))
    res["pruned_wins_folds"] = f"{wins}/{len(res['full']['folds'])}"
    res["delta"] = round(res["pruned"]["mean"] - res["full"]["mean"], 4)
    out[target] = res
    print(f"{target}: full {res['full']['mean']:.4f}+/-{res['full']['sd']:.4f}  "
          f"pruned {res['pruned']['mean']:.4f}+/-{res['pruned']['sd']:.4f}  "
          f"delta {res['delta']:+.4f}  pruned wins {res['pruned_wins_folds']}")
    print(f"   full   folds {res['full']['folds']}")
    print(f"   pruned folds {res['pruned']['folds']}")

print(json.dumps(out, indent=2))
