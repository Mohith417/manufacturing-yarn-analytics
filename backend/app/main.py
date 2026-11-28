"""YarnLens scoring API.

Run locally (from backend/):  uvicorn app.main:app --reload --port 8000
or through Docker:           docker compose -f docker/docker-compose.app.yml up --build
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import ALLOWED_ORIGINS, SIMULATED_INTERVAL_SECONDS
from .db import Store
from .model_store import ModelStore, status_for
from .schemas import Reading, ScoreRequest, ScoreResponse, ScoreResult
from .simulator import Simulator

models = ModelStore()
store = Store()
simulator = Simulator()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    models.load()
    simulator.load()
    # A missing database is a supported state, not a crash.
    store.init()
    yield


app = FastAPI(
    title="YarnLens scoring API",
    version="1.0.0",
    description=(
        "Scores machine readings with the saved scikit-learn models exported by "
        "ml/export_sklearn_models.py. Every simulation is labelled simulated."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)


def require_model(name: str) -> None:
    if name not in models.available():
        raise HTTPException(
            status_code=400,
            detail=f"Model '{name}' is not loaded. Available: {', '.join(models.available()) or 'none'}.",
        )


@app.get("/api/health")
def health() -> dict:
    database = store.health()
    return {
        "status": "ok",
        "models": models.available(),
        "database": database,
        "simulated_interval_seconds": SIMULATED_INTERVAL_SECONDS,
        "rows_stored": store.count() if database else 0,
    }


@app.get("/api/models")
def list_models() -> dict:
    return {
        "library": "scikit-learn",
        "note": models.metrics.get("note", ""),
        "trained_at": models.metrics.get("trained_at"),
        "cutoff_date": models.metrics.get("cutoff_date"),
        "test_rows": models.metrics.get("test_rows"),
        "models": [
            {"name": name, **({"metrics": models.metrics_for(name)} if models.metrics_for(name) else {})}
            for name in models.available()
        ],
    }


def score_rows(readings: list[Reading], model_name: str) -> list[dict]:
    rows = []
    for reading in readings:
        probability, factors = models.score(model_name, reading.features())
        rows.append(
            {
                "machine_id": reading.machine_id,
                "timestamp": reading.timestamp,
                "risk": probability,
                "status": status_for(probability),
                "top_factors": factors,
                "features": reading.features(),
            }
        )
    return rows


@app.post("/api/score", response_model=ScoreResponse)
def score(request: ScoreRequest) -> ScoreResponse:
    require_model(request.model)
    scored = score_rows(request.readings, request.model)
    # Upload scoring is stored too, so History can compare a file with the feed.
    store.store(
        [
            {
                "machine_id": row["machine_id"],
                "risk": row["risk"],
                "status": row["status"],
                "top_factors": row["top_factors"],
                "line": "upload",
            }
            for row in scored
        ],
        source="upload",
        simulated=False,
        model=request.model,
    )
    return ScoreResponse(
        model=request.model,
        results=[
            ScoreResult(
                machine_id=row["machine_id"],
                risk=row["risk"],
                status=row["status"],
                top_factors=row["top_factors"],
            )
            for row in scored
        ],
    )


@app.get("/api/stream")
async def stream() -> StreamingResponse:
    """Server-Sent Events. One batch of simulated readings per interval.

    Each batch carries every machine, already scored by the requested model
    (logistic regression by default), and is stored with simulated=true.
    """
    require_model("logistic_regression")

    async def events():
        hello = {
            "interval_seconds": SIMULATED_INTERVAL_SECONDS,
            "models": models.available(),
            "simulated": True,
            "database": store.available,
        }
        yield f"event: hello\ndata: {json.dumps(hello)}\n\n"

        while True:
            batch = simulator.step()
            rows = []
            for item in batch:
                probability, factors = models.score(
                    "logistic_regression", item["features"]
                )
                rows.append(
                    {
                        "machine_id": item["machine_id"],
                        "line": item["line"],
                        "timestamp": item["timestamp"],
                        "risk": round(probability, 6),
                        "status": status_for(probability),
                        "factors": factors,
                        "simulated": True,
                        "model": "logistic_regression",
                    }
                )

            await asyncio.to_thread(
                store.store,
                [
                    {
                        "machine_id": row["machine_id"],
                        "risk": row["risk"],
                        "status": row["status"],
                        "top_factors": row["factors"],
                        "line": row["line"],
                    }
                    for row in rows
                ],
                source="live",
                simulated=True,
                model="logistic_regression",
            )

            payload = {
                "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "interval_seconds": SIMULATED_INTERVAL_SECONDS,
                "simulated": True,
                "readings": rows,
            }
            yield f"event: batch\ndata: {json.dumps(payload)}\n\n"
            await asyncio.sleep(SIMULATED_INTERVAL_SECONDS)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def require_database() -> None:
    if not store.health():
        raise HTTPException(
            status_code=503,
            detail="The database is not reachable. Start it with docker/docker-compose.app.yml.",
        )


@app.get("/api/history")
def history(
    machine_id: str | None = Query(default=None, max_length=32, pattern=r"^[A-Za-z0-9_-]*$"),
    limit: int = Query(default=200, ge=1, le=1000),
) -> dict:
    require_database()
    return {"readings": store.history(machine_id or None, limit)}


@app.get("/api/trends")
def trends(hours: int = Query(default=24, ge=1, le=168)) -> dict:
    require_database()
    return {"points": store.trends(hours)}


@app.delete("/api/history")
def delete_history(confirm: str = Query(default="")) -> dict:
    require_database()
    if confirm != "clear-all":
        raise HTTPException(
            status_code=400,
            detail="Clearing history needs confirm=clear-all. This protects a mistyped request.",
        )
    return {"deleted": store.clear()}
