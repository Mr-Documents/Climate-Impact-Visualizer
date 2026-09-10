"""Request and response contracts for the prediction service.

Pydantic validates every field at the boundary, so malformed input is rejected
with a clear 422 before it can reach a model. Nothing here echoes an internal
exception back to the caller.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

RiskBand = Literal["Low", "Moderate", "High", "Very High"]


class PredictionRequest(BaseModel):
    """A request for risk at one coordinate."""

    model_config = ConfigDict(extra="forbid")

    latitude: float = Field(..., ge=-90.0, le=90.0, description="Degrees north, WGS84.")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Degrees east, WGS84.")

    @field_validator("latitude")
    @classmethod
    def reject_unsupported_latitude(cls, value: float) -> float:
        """The models were trained between 60S and 80N and do not extrapolate.

        Refusing out-of-range coordinates is more honest than returning a
        confident-looking number for Antarctica, where the land surface model
        carries no soil moisture at all.
        """
        if not -60.0 <= value <= 80.0:
            raise ValueError(
                "latitude must be between -60 and 80; the models were not trained "
                "on polar regions and would be extrapolating"
            )
        return value


class RiskAssessment(BaseModel):
    """One hazard's assessment."""

    probability: float = Field(..., ge=0.0, le=1.0, description="Calibrated event probability.")
    band: RiskBand = Field(..., description="Probability mapped to a display band.")
    exceeds_threshold: bool = Field(
        ..., description="Whether probability passes the operating threshold."
    )
    threshold: float = Field(..., description="Operating threshold, tuned on validation data.")
    model_version: str
    horizon_days: int
    definition: str = Field(..., description="Precisely what the probability refers to.")


class PredictionResponse(BaseModel):
    """The full response for one coordinate."""

    latitude: float
    longitude: float
    as_of: str = Field(..., description="Date of the most recent observation used.")
    flood: RiskAssessment
    drought: RiskAssessment
    observations_used: int
    disclaimer: str = Field(
        default=(
            "Decision support only. Flood output describes flood-generating "
            "hydrometeorological conditions, not observed flooding, and does not "
            "account for terrain, drainage or flood defences."
        )
    )


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    models_loaded: list[str]
    detail: str | None = None


class ErrorResponse(BaseModel):
    """A safe error body - never carries a stack trace or internal path."""

    error: str
    detail: str | None = None
