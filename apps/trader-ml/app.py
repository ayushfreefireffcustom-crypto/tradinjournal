"""LightGBM challenger for Trader Master.

The Node API decides whether this model is served. This process only trains
and predicts. Direction is never decided here.

  uvicorn app:app --host 127.0.0.1 --port 4010
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="trader-ml")

try:
    import lightgbm as lgb
except ImportError:  # pragma: no cover
    lgb = None  # type: ignore


class TrainBody(BaseModel):
    X: list[list[float]]
    y: list[int]
    asOfMs: list[int] = Field(default_factory=list)
    featureNames: list[str] = Field(default_factory=list)


class PredictBody(BaseModel):
    values: list[float]
    model: str
    featureNames: list[str] = Field(default_factory=list)


def _auc(scores: np.ndarray, labels: np.ndarray) -> float | None:
    pos = scores[labels == 1]
    neg = scores[labels == 0]
    if len(pos) == 0 or len(neg) == 0:
        return None
    wins = 0.0
    for p in pos:
        wins += float(np.sum(p > neg) + 0.5 * np.sum(p == neg))
    return wins / (len(pos) * len(neg))


def _brier(probs: np.ndarray, labels: np.ndarray) -> float | None:
    if len(probs) == 0:
        return None
    return float(np.mean((probs - labels) ** 2))


def _fit(X: np.ndarray, y: np.ndarray) -> Any:
    params = {
        "objective": "binary",
        "learning_rate": 0.05,
        "num_leaves": 8,
        "min_data_in_leaf": 8,
        "feature_fraction": 0.9,
        "verbosity": -1,
        "seed": 7,
    }
    ds = lgb.Dataset(X, label=y)
    return lgb.train(params, ds, num_boost_round=80)


def _walk_forward(X: np.ndarray, y: np.ndarray, as_of: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    n = len(y)
    folds = 4
    embargo = 48 * 3600_000
    oof = np.full(n, np.nan)
    order = np.argsort(as_of) if len(as_of) == n else np.arange(n)
    fold_size = n // folds
    if fold_size < 5:
        return oof, y
    for f in range(1, folds):
        test_start = f * fold_size
        test_end = n if f == folds - 1 else (f + 1) * fold_size
        test_idx = order[test_start:test_end]
        if len(as_of) == n:
            test_min = float(np.min(as_of[test_idx]))
            train_idx = [i for i in order[:test_start] if as_of[i] < test_min - embargo]
        else:
            train_idx = list(order[:test_start])
        if len(train_idx) < 16 or len(test_idx) < 4:
            continue
        if len(set(y[train_idx].tolist())) < 2:
            continue
        booster = _fit(X[train_idx], y[train_idx])
        pred = booster.predict(X[test_idx])
        oof[test_idx] = pred
    return oof, y


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": lgb is not None}


@app.post("/train")
def train(body: TrainBody) -> dict[str, Any]:
    if lgb is None:
        return {"trained": False, "reason": "lightgbm is not installed"}
    X = np.asarray(body.X, dtype=float)
    y = np.asarray(body.y, dtype=int)
    if X.ndim != 2 or len(y) != len(X) or len(y) < 24:
        return {"trained": False, "reason": f"Need ≥24 rows (have {len(y)})", "sampleSize": int(len(y))}
    if len(set(y.tolist())) < 2:
        return {"trained": False, "reason": "Need both hits and misses", "sampleSize": int(len(y))}

    as_of = np.asarray(body.asOfMs, dtype=float) if body.asOfMs else np.arange(len(y), dtype=float)
    oof, labels = _walk_forward(X, y, as_of)
    mask = np.isfinite(oof)
    oof_auc = _auc(oof[mask], labels[mask]) if mask.any() else None
    oof_brier = _brier(oof[mask], labels[mask]) if mask.any() else None
    booster = _fit(X, y)
    return {
        "trained": True,
        "sampleSize": int(len(y)),
        "oofAuc": None if oof_auc is None or math.isnan(oof_auc) else float(oof_auc),
        "oofBrier": None if oof_brier is None or math.isnan(oof_brier) else float(oof_brier),
        "featureNames": body.featureNames,
        "model": booster.model_to_string(),
        "trainedAt": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/predict")
def predict(body: PredictBody) -> dict[str, Any]:
    if lgb is None:
        return {"probability": None, "reason": "lightgbm is not installed"}
    booster = lgb.Booster(model_str=body.model)
    x = np.asarray([body.values], dtype=float)
    p = float(booster.predict(x)[0])
    return {"probability": max(0.05, min(0.95, p))}
