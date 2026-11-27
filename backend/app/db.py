"""PostgreSQL storage for scored readings.

Every statement that touches user input is parameterized. A database failure
never breaks scoring: the API reports the database as unavailable and the
static parts of the dashboard keep working.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .config import DATABASE_URL, DB_DIR, HISTORY_RETENTION


class Store:
    def __init__(self, dsn: str = DATABASE_URL) -> None:
        self.dsn = dsn
        self.available = False

    # ---------------------------------------------------------------- setup --
    def init(self) -> bool:
        try:
            with psycopg.connect(self.dsn, connect_timeout=5) as connection:
                schema = (DB_DIR / "init.sql").read_text(encoding="utf-8")
                with connection.cursor() as cursor:
                    cursor.execute(schema)
                connection.commit()
            self.available = True
        except Exception:
            self.available = False
        return self.available

    def health(self) -> bool:
        try:
            with psycopg.connect(self.dsn, connect_timeout=3) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT 1")
                    cursor.fetchone()
            self.available = True
        except Exception:
            self.available = False
        return self.available

    # --------------------------------------------------------------- writes --
    def store(
        self,
        rows: list[dict[str, Any]],
        *,
        source: str,
        simulated: bool,
        model: str,
    ) -> int:
        if not rows:
            return 0
        try:
            with psycopg.connect(self.dsn, connect_timeout=5) as connection:
                with connection.cursor() as cursor:
                    for row in rows:
                        cursor.execute(
                            """
                            INSERT INTO readings
                                (machine_id, risk, status, simulated, source, model)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            RETURNING id
                            """,
                            (
                                row["machine_id"],
                                float(row["risk"]),
                                row["status"],
                                simulated,
                                source,
                                model,
                            ),
                        )
                        reading_id = cursor.fetchone()[0]
                        cursor.execute(
                            """
                            INSERT INTO scores (reading_id, model, probability, top_factors)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (reading_id) DO NOTHING
                            """,
                            (
                                reading_id,
                                model,
                                float(row["risk"]),
                                json.dumps(row.get("top_factors", [])),
                            ),
                        )
                        cursor.execute(
                            """
                            INSERT INTO machines (machine_id, line)
                            VALUES (%s, %s)
                            ON CONFLICT (machine_id) DO NOTHING
                            """,
                            (row["machine_id"], row.get("line", "unknown")),
                        )
                    cursor.execute(
                        "DELETE FROM readings WHERE id <= "
                        "(SELECT COALESCE(MAX(id), 0) - %s FROM readings)",
                        (HISTORY_RETENTION,),
                    )
                connection.commit()
            self.available = True
            return len(rows)
        except Exception:
            self.available = False
            return 0

    # ---------------------------------------------------------------- reads --
    def history(self, machine_id: str | None, limit: int) -> list[dict[str, Any]]:
        with psycopg.connect(self.dsn, connect_timeout=5, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                if machine_id:
                    cursor.execute(
                        """
                        SELECT id, machine_id, risk, status, simulated, source, model, scored_at
                        FROM readings
                        WHERE machine_id = %s
                        ORDER BY id DESC
                        LIMIT %s
                        """,
                        (machine_id, limit),
                    )
                else:
                    cursor.execute(
                        """
                        SELECT id, machine_id, risk, status, simulated, source, model, scored_at
                        FROM readings
                        ORDER BY id DESC
                        LIMIT %s
                        """,
                        (limit,),
                    )
                return [dict(row) for row in cursor.fetchall()]

    def trends(self, hours: int = 24) -> list[dict[str, Any]]:
        with psycopg.connect(self.dsn, connect_timeout=5, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT date_trunc('hour', scored_at) AS bucket,
                           AVG(risk) AS avg_risk,
                           COUNT(*) AS count
                    FROM readings
                    WHERE scored_at >= NOW() - make_interval(hours => %s)
                    GROUP BY bucket
                    ORDER BY bucket
                    """,
                    (int(hours),),
                )
                return [
                    {
                        "bucket": row["bucket"]
                        .replace(tzinfo=timezone.utc)
                        .isoformat(),
                        "avg_risk": float(row["avg_risk"]),
                        "count": int(row["count"]),
                    }
                    for row in cursor.fetchall()
                ]

    def count(self) -> int:
        try:
            with psycopg.connect(self.dsn, connect_timeout=3) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT COUNT(*) FROM readings")
                    return int(cursor.fetchone()[0])
        except Exception:
            return 0

    def clear(self) -> int:
        with psycopg.connect(self.dsn, connect_timeout=5) as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM readings")
                deleted = cursor.rowcount
                cursor.execute("DELETE FROM scores")
            connection.commit()
        return int(deleted)
