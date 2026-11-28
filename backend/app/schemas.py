"""Request and response shapes. Pydantic rejects bad input with a 422."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ModelName = Literal["logistic_regression", "decision_tree", "random_forest"]


class Reading(BaseModel):
    model_config = ConfigDict(extra="forbid")

    machine_id: str = Field(
        min_length=1,
        max_length=32,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="Machine identifier, letters, digits, dash or underscore.",
    )
    machine_age_years: float = Field(ge=0, le=120)
    operating_hours: float = Field(ge=0, le=100000)
    temperature_c: float = Field(ge=-60, le=300)
    vibration_mm_s: float = Field(ge=0, le=500)
    days_since_maintenance: float = Field(ge=0, le=20000)
    past_maintenance_events: float = Field(ge=0, le=10000)
    timestamp: str | None = None

    def features(self) -> dict[str, float]:
        return {
            "machine_age_years": self.machine_age_years,
            "operating_hours": self.operating_hours,
            "temperature_c": self.temperature_c,
            "vibration_mm_s": self.vibration_mm_s,
            "days_since_maintenance": self.days_since_maintenance,
            "past_maintenance_events": self.past_maintenance_events,
        }


class ScoreRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: ModelName = "logistic_regression"
    readings: list[Reading] = Field(min_length=1, max_length=5000)


class ScoreResult(BaseModel):
    machine_id: str
    risk: float
    status: Literal["green", "amber", "red"]
    top_factors: list[str]


class ScoreResponse(BaseModel):
    model: str
    library: str = "scikit-learn"
    results: list[ScoreResult]
