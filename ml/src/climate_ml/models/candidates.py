"""Candidate models and baselines.

Ordered deliberately from simplest to most complex. Nothing is selected because
it sounds advanced: a model only ships if it beats both baselines AND the
simpler candidates on validation data.

Baselines exist so that "the model works" is a measurable claim:

BaseRate
    Always predict the training positive rate. The floor.
Persistence
    Assume today's state continues. For drought this is strong, because SPEI-3
    overlaps months already observed - beating it is the only evidence the model
    learned more than "conditions are sticky".
LogisticRegression
    A linear reference. If a gradient-boosted forest cannot beat it, the extra
    complexity is not earning anything.

Class imbalance is handled with class weights rather than resampling, which
keeps the training distribution intact and leaves probabilities interpretable.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from climate_ml import config


class BaseRateClassifier(BaseEstimator, ClassifierMixin):
    """Predicts the training positive rate for every row.

    The floor for PR-AUC: a model that cannot beat this has learned nothing.
    """

    def fit(self, X, y):
        self.rate_ = float(np.mean(y))
        self.classes_ = np.array([0, 1])
        return self

    def predict_proba(self, X):
        rate = np.full(len(X), self.rate_)
        return np.column_stack([1 - rate, rate])

    def predict(self, X):
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)


class ColumnPersistenceClassifier(BaseEstimator, ClassifierMixin):
    """Uses a single already-computed indicator column as the score.

    Not learned - it exposes an existing signal (current drought state, or
    today's rainfall relative to R95p) as a scored baseline so it can be
    compared like for like on PR-AUC.
    """

    def __init__(self, column_index: int = 0, invert: bool = False):
        self.column_index = column_index
        self.invert = invert

    def fit(self, X, y):
        column = np.asarray(X)[:, self.column_index].astype(float)
        finite = column[np.isfinite(column)]
        self.low_ = float(np.nanpercentile(finite, 1)) if finite.size else 0.0
        self.high_ = float(np.nanpercentile(finite, 99)) if finite.size else 1.0
        self.classes_ = np.array([0, 1])
        return self

    def predict_proba(self, X):
        column = np.asarray(X)[:, self.column_index].astype(float)
        span = self.high_ - self.low_
        scaled = (column - self.low_) / span if span > 0 else np.zeros_like(column)
        scaled = np.clip(np.nan_to_num(scaled, nan=0.5), 0.0, 1.0)
        if self.invert:
            scaled = 1.0 - scaled
        return np.column_stack([1 - scaled, scaled])

    def predict(self, X):
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)


@dataclass(frozen=True)
class Candidate:
    """One named model, with a note on why it is in the comparison."""

    name: str
    estimator: object
    tier: str          # "baseline" or "candidate"
    rationale: str


def _linear_pipeline(estimator) -> Pipeline:
    """Impute then scale - required for the linear model, harmless for trees.

    The imputer is fitted inside the pipeline, so its statistics come from the
    training fold only. Doing it outside would leak across the split.
    """
    return Pipeline(
        [
            ("impute", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
            ("model", estimator),
        ]
    )


def build_candidates(persistence_column_index: int | None = None) -> list[Candidate]:
    """Assemble the comparison set, simplest first."""
    candidates = [
        Candidate(
            name="base_rate",
            estimator=BaseRateClassifier(),
            tier="baseline",
            rationale="Always predicts the training positive rate. The floor.",
        ),
        Candidate(
            name="logistic_regression",
            estimator=_linear_pipeline(
                LogisticRegression(
                    max_iter=2000,
                    class_weight="balanced",
                    random_state=config.RANDOM_STATE,
                )
            ),
            tier="baseline",
            rationale="Linear reference. Extra complexity must beat this to be justified.",
        ),
        Candidate(
            name="random_forest",
            # Constrained deliberately. An unconstrained forest (300 trees,
            # min_samples_leaf=20) reached depth 34-44 and 2.69 million nodes,
            # producing a 291 MB artefact that could not fit the 512 MB
            # deployment tier. Capping depth and raising the leaf minimum was
            # measured and found to IMPROVE validation PR-AUC - flood
            # 0.2288 -> 0.2453, drought 0.6129 -> 0.6238 - while shrinking the
            # model roughly 13x. The deep forest was overfitting; the size
            # constraint and the accuracy improvement pointed the same way.
            estimator=RandomForestClassifier(
                n_estimators=150,
                min_samples_leaf=200,
                max_depth=18,
                class_weight="balanced_subsample",
                n_jobs=-1,
                random_state=config.RANDOM_STATE,
            ),
            tier="candidate",
            rationale=(
                "Robust to scaling, captures interactions. Depth-capped: measured "
                "more accurate AND ~13x smaller than an unconstrained forest."
            ),
        ),
        Candidate(
            name="gradient_boosting",
            estimator=HistGradientBoostingClassifier(
                max_iter=400,
                learning_rate=0.06,
                max_leaf_nodes=31,
                min_samples_leaf=40,
                l2_regularization=1.0,
                early_stopping=True,
                validation_fraction=0.15,
                class_weight="balanced",
                random_state=config.RANDOM_STATE,
            ),
            tier="candidate",
            rationale="Expected strongest on engineered tabular features; handles NaN natively.",
        ),
    ]

    if persistence_column_index is not None:
        candidates.insert(
            1,
            Candidate(
                name="persistence",
                estimator=ColumnPersistenceClassifier(
                    column_index=persistence_column_index, invert=True
                ),
                tier="baseline",
                rationale=(
                    "Assumes today's state continues. Strong for drought because "
                    "SPEI-3 overlaps already-observed months."
                ),
            ),
        )
    return candidates
