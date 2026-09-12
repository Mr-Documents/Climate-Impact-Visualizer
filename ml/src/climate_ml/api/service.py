"""FastAPI prediction service.

Sits behind the existing Node/Express backend rather than being exposed to the
browser directly. Express already implements CORS origin allowlisting, rate
limiting, Supabase logging and water-body detection; duplicating that here would
mean a second public origin and a second CORS policy to keep in step. Keeping
this service internal leaves one public API, one place to change, and keeps the
model files off the public internet. The cost is a single extra hop, which is
negligible beside the upstream climate API calls already in the request path.

Error handling contract: every failure returns a typed JSON body with a useful
message and the right status code. Stack traces and internal paths are logged,
never returned.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from climate_ml.api.inference import (
    LocationUnsupported,
    ModelNotAvailable,
    PredictionService,
    UpstreamUnavailable,
)
from climate_ml.api.schemas import (
    ErrorResponse,
    HealthResponse,
    PredictionRequest,
    PredictionResponse,
    RiskAssessment,
)

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("climate_ml.api")

# Starlette renamed this constant between releases; accept either so the service
# is not pinned to one line.
HTTP_422 = (
    getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", None)
    or status.HTTP_422_UNPROCESSABLE_ENTITY
)

_service: PredictionService | None = None
_startup_error: str | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load models once at startup.

    A model-loading failure does not crash the process: the service starts in a
    degraded state and /health reports it, which is friendlier to a deployment
    platform than a crash loop.
    """
    global _service, _startup_error
    try:
        _service = PredictionService()
        logger.info("prediction service ready: %s", _service.loaded)
    except ModelNotAvailable as exc:
        _startup_error = str(exc)
        logger.error("starting DEGRADED - models unavailable: %s", exc)
    yield
    _service = None


app = FastAPI(
    title="Climate Risk ML API",
    version="1.0.0",
    summary="Flood and drought risk classification from ERA5 climate reanalysis.",
    lifespan=lifespan,
)


# --- error handling ---------------------------------------------------------

@app.exception_handler(RequestValidationError)
async def on_validation_error(request: Request, exc: RequestValidationError):
    """Turn Pydantic's detail into one clear sentence for the caller."""
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", ()) if p != "body") or "request"
    return JSONResponse(
        status_code=HTTP_422,
        content=ErrorResponse(
            error="invalid request",
            detail=f"{field}: {first.get('msg', 'failed validation')}",
        ).model_dump(),
    )


@app.exception_handler(Exception)
async def on_unexpected_error(request: Request, exc: Exception):
    """Log the detail, return none of it."""
    logger.exception("unhandled error on %s", request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ErrorResponse(
            error="internal error",
            detail="The request could not be completed. The incident has been logged.",
        ).model_dump(),
    )


# --- endpoints --------------------------------------------------------------

@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness and model-availability check for the platform and for Express."""
    if _service is None:
        return HealthResponse(status="degraded", models_loaded=[], detail=_startup_error)
    return HealthResponse(status="ok", models_loaded=_service.loaded)


@app.post(
    "/predict",
    response_model=PredictionResponse,
    responses={
        422: {"model": ErrorResponse, "description": "Invalid coordinates"},
        503: {"model": ErrorResponse, "description": "Models or climate data unavailable"},
    },
)
async def predict(request: PredictionRequest) -> PredictionResponse | JSONResponse:
    """Assess flood and drought risk at one coordinate.

    Both hazards come from one call because they share the same feature
    assembly and the same upstream fetch - splitting them into /predict/flood
    and /predict/drought would double the climate API cost for no benefit.
    """
    if _service is None:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=ErrorResponse(
                error="models unavailable",
                detail="The service started without trained models. Run training and redeploy.",
            ).model_dump(),
        )

    try:
        result = _service.predict(request.latitude, request.longitude)
    except LocationUnsupported as exc:
        return JSONResponse(
            status_code=HTTP_422,
            content=ErrorResponse(error="unsupported location", detail=str(exc)).model_dump(),
        )
    except UpstreamUnavailable as exc:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=ErrorResponse(error="climate data unavailable", detail=str(exc)).model_dump(),
        )
    except ModelNotAvailable as exc:
        logger.error("model problem during prediction: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=ErrorResponse(
                error="models unavailable",
                detail="The trained models could not be used for this request.",
            ).model_dump(),
        )

    return PredictionResponse(
        latitude=result["latitude"],
        longitude=result["longitude"],
        as_of=result["as_of"],
        observations_used=result["observations_used"],
        flood=RiskAssessment(**vars(result["flood"])),
        drought=RiskAssessment(**vars(result["drought"])),
    )
