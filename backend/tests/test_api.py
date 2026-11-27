"""API tests. Scoring needs only the saved models; the storage tests run when
the Postgres container is reachable (docker/docker-compose.app.yml)."""

from __future__ import annotations

import asyncio
import os

os.environ.setdefault("SIMULATED_INTERVAL_SECONDS", "0.05")

import numpy as np  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Store  # noqa: E402
from app.main import app, models, simulator, stream  # noqa: E402

client = TestClient(app)

READING = {
    "machine_id": "M013",
    "machine_age_years": 16.6,
    "operating_hours": 23.91,
    "temperature_c": 74.12,
    "vibration_mm_s": 8.435,
    "days_since_maintenance": 135,
    "past_maintenance_events": 2,
}


def test_health_lists_models():
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert set(body["models"]) == {"logistic_regression", "decision_tree", "random_forest"}
    assert isinstance(body["database"], bool)


def test_models_are_labelled_scikit_learn():
    response = client.get("/api/models")
    assert response.status_code == 200
    body = response.json()
    assert body["library"] == "scikit-learn"
    assert len(body["models"]) == 3
    assert "Spark" in body["note"]


def test_score_matches_the_saved_joblib_model():
    response = client.post("/api/score", json={"readings": [READING]})
    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "logistic_regression"

    expected, _factors = models.score("logistic_regression", READING)
    assert abs(body["results"][0]["risk"] - expected) < 1e-9
    assert body["results"][0]["status"] in {"green", "amber", "red"}
    assert body["results"][0]["top_factors"]


def test_every_model_scores_and_is_named_in_the_response():
    for name in ("logistic_regression", "decision_tree", "random_forest"):
        response = client.post("/api/score", json={"model": name, "readings": [READING]})
        assert response.status_code == 200
        assert response.json()["model"] == name
        risk = response.json()["results"][0]["risk"]
        assert 0.0 <= risk <= 1.0


def test_decision_tree_uses_probabilities_not_hard_labels():
    """The old 0.53 ROC-AUC came from scoring hard 0/1 predictions. The served
    model must return probabilities that vary between machines."""
    low = dict(READING, vibration_mm_s=1.0, days_since_maintenance=2, machine_age_years=2)
    high = dict(READING, vibration_mm_s=12.0, days_since_maintenance=170, machine_age_years=19)
    first = client.post(
        "/api/score", json={"model": "decision_tree", "readings": [low]}
    ).json()["results"][0]["risk"]
    second = client.post(
        "/api/score", json={"model": "decision_tree", "readings": [high]}
    ).json()["results"][0]["risk"]
    assert 0.0 <= first <= 1.0 and 0.0 <= second <= 1.0
    assert first != second


def test_batch_scoring_keeps_order():
    readings = [READING, dict(READING, machine_id="M006")]
    response = client.post("/api/score", json={"readings": readings})
    assert [row["machine_id"] for row in response.json()["results"]] == ["M013", "M006"]


def test_bad_input_is_rejected_with_422():
    cases = [
        {"readings": []},
        {"readings": [dict(READING, vibration_mm_s=-2)]},
        {"readings": [dict(READING, temperature_c=900)]},
        {"readings": [dict(READING, machine_id="bad id!")]},
        {"readings": [{"machine_id": "M013"}]},
        {"readings": [dict(READING, extra_column=1)]},
        {"model": "nope", "readings": [READING]},
    ]
    for payload in cases:
        response = client.post("/api/score", json=payload)
        assert response.status_code == 422, payload


def test_simulator_stays_inside_physical_ranges():
    machine_count = len(simulator.machines)
    assert machine_count == 50
    for _ in range(40):
        batch = simulator.step()
        assert len(batch) == machine_count
        for item in batch:
            features = item["features"]
            assert 0 <= features["operating_hours"] <= 24
            assert 0 <= features["temperature_c"] <= 300
            assert 0 <= features["vibration_mm_s"] <= 500
            assert 0 <= features["days_since_maintenance"] <= 20000
            assert np.isfinite(features["machine_age_years"])


def test_sse_first_frame_is_labelled_simulated():
    async def first_frame() -> str:
        response = await stream()
        iterator = response.body_iterator
        chunk = await iterator.__anext__()
        await iterator.aclose()
        return chunk.decode() if isinstance(chunk, bytes) else str(chunk)

    frame = asyncio.run(first_frame())
    assert "event: hello" in frame
    assert '"simulated": true' in frame


HAS_DB = Store().health()


def test_database_round_trip_when_available():
    if not HAS_DB:
        import pytest

        pytest.skip("Postgres is not running; start docker/docker-compose.app.yml")

    from app.main import store

    machine = "T999"
    rows = [
        {"machine_id": machine, "risk": 0.81, "status": "red", "top_factors": ["Vibration"], "line": "Line_A"},
        {"machine_id": machine, "risk": 0.22, "status": "green", "top_factors": [], "line": "Line_A"},
    ]
    assert store.store(rows, source="upload", simulated=False, model="logistic_regression") == 2

    history = client.get(f"/api/history?machine_id={machine}&limit=2")
    assert history.status_code == 200
    assert len(history.json()["readings"]) == 2
    assert history.json()["readings"][0]["source"] == "upload"

    trends = client.get("/api/trends?hours=24")
    assert trends.status_code == 200
    assert trends.json()["points"]

    refused = client.delete("/api/history")
    assert refused.status_code == 400

    cleared = client.delete("/api/history?confirm=clear-all")
    assert cleared.status_code == 200
    assert cleared.json()["deleted"] >= 2
    assert client.get("/api/history").json()["readings"] == []
