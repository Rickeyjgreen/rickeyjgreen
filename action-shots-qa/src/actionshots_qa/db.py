from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from . import PIPELINE_VERSION


SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, source_path TEXT NOT NULL, roster_path TEXT NOT NULL,
  status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  pipeline_version TEXT NOT NULL, settings_json TEXT NOT NULL, error TEXT
);
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL, absolute_path TEXT NOT NULL, copyright_code TEXT,
  capture_time TEXT, width INTEGER, height INTEGER, file_size INTEGER,
  file_sha256 TEXT, scan_sha256_before TEXT, copyright_before TEXT,
  proxy_path TEXT, analysis_status TEXT NOT NULL DEFAULT 'PENDING',
  current_rating INTEGER, proposed_rating INTEGER,
  UNIQUE(job_id, relative_path)
);
CREATE TABLE IF NOT EXISTS identity_clusters (
  id INTEGER PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  copyright_code TEXT NOT NULL, cluster_number INTEGER NOT NULL,
  confidence REAL NOT NULL DEFAULT 0, subject_type TEXT,
  UNIQUE(job_id, copyright_code, cluster_number)
);
CREATE TABLE IF NOT EXISTS faces (
  id INTEGER PRIMARY KEY, image_id INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  bbox_json TEXT NOT NULL, confidence REAL NOT NULL, landmarks_json TEXT NOT NULL,
  embedding BLOB, identity_cluster_id INTEGER REFERENCES identity_clusters(id)
);
CREATE TABLE IF NOT EXISTS image_metrics (
  image_id INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
  face_count INTEGER NOT NULL DEFAULT 0, sharpness REAL, exposure REAL,
  clipping REAL, face_size_score REAL, pose_score REAL, expression_score REAL,
  eye_score REAL, framing_score REAL, group_score REAL, portrait_score REAL,
  details_json TEXT
);
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  image_id INTEGER REFERENCES images(id), cluster_id INTEGER REFERENCES identity_clusters(id),
  decision TEXT NOT NULL, rating INTEGER, confidence REAL NOT NULL,
  reason TEXT, source TEXT NOT NULL CHECK(source IN ('AUTO','HUMAN','RULE')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS exceptions (
  id INTEGER PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  copyright_code TEXT, cluster_id INTEGER REFERENCES identity_clusters(id),
  reason TEXT NOT NULL, candidate_images_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN', resolution_json TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  image_id INTEGER REFERENCES images(id), event TEXT NOT NULL,
  ok INTEGER NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_images_job_status ON images(job_id, analysis_status);
CREATE INDEX IF NOT EXISTS idx_images_job_code ON images(job_id, copyright_code);
CREATE INDEX IF NOT EXISTS idx_faces_image ON faces(image_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_job_status ON exceptions(job_id, status);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.executescript(SCHEMA)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def create_job(self, source: Path, roster: Path, settings_json: str) -> str:
        job_id = uuid.uuid4().hex[:12]
        stamp = now()
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,NULL)",
                (job_id, str(source.resolve()), str(roster.resolve()), "CREATED", stamp,
                 stamp, PIPELINE_VERSION, settings_json),
            )
        return job_id

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        with self.connect() as conn:
            conn.execute(sql, params)

    def query(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self.connect() as conn:
            return [dict(row) for row in conn.execute(sql, params).fetchall()]

    def one(self, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        rows = self.query(sql, params)
        return rows[0] if rows else None

    def set_job_status(self, job_id: str, status: str, error: str | None = None) -> None:
        self.execute("UPDATE jobs SET status=?, updated_at=?, error=? WHERE id=?",
                     (status, now(), error, job_id))

    def audit(self, job_id: str, event: str, ok: bool, details: dict[str, Any],
              image_id: int | None = None) -> None:
        self.execute(
            "INSERT INTO audit_events(job_id,image_id,event,ok,details_json,created_at) VALUES(?,?,?,?,?,?)",
            (job_id, image_id, event, int(ok), json.dumps(details, sort_keys=True), now()),
        )

