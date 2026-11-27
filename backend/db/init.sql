-- YarnLens scoring schema.
-- Executed by the Postgres image on first start (mounted into
-- /docker-entrypoint-initdb.d) and again by the API at startup, so the tables
-- exist whether the volume is new or the API is pointed at an empty database.

CREATE TABLE IF NOT EXISTS machines (
    machine_id TEXT PRIMARY KEY,
    line       TEXT NOT NULL DEFAULT 'unknown',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS readings (
    id         BIGSERIAL PRIMARY KEY,
    machine_id TEXT NOT NULL,
    risk       DOUBLE PRECISION NOT NULL CHECK (risk >= 0 AND risk <= 1),
    status     TEXT NOT NULL CHECK (status IN ('green', 'amber', 'red')),
    simulated  BOOLEAN NOT NULL DEFAULT FALSE,
    source     TEXT NOT NULL,
    model      TEXT NOT NULL,
    scored_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS readings_machine_time_idx
    ON readings (machine_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS readings_time_idx
    ON readings (scored_at DESC);

CREATE TABLE IF NOT EXISTS scores (
    reading_id  BIGINT PRIMARY KEY REFERENCES readings (id) ON DELETE CASCADE,
    model       TEXT NOT NULL,
    probability DOUBLE PRECISION NOT NULL CHECK (probability >= 0 AND probability <= 1),
    top_factors JSONB NOT NULL DEFAULT '[]'::jsonb
);
