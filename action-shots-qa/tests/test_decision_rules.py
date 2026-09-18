import json
from pathlib import Path

import numpy as np

from actionshots_qa.config import load_settings
from actionshots_qa.db import Database
from actionshots_qa.pipeline import _add_exception, _cluster_and_decide, write_report


def _image(conn, job: str, shoot: Path, name: str, code: str, face_count: int,
           score: float, details: dict | None = None) -> int:
    cursor = conn.execute(
        """INSERT INTO images(job_id,relative_path,absolute_path,copyright_code,
        analysis_status,proposed_rating) VALUES(?,?,?,?,?,0)""",
        (job, name, str(shoot / name), code, "DONE"),
    )
    image_id = cursor.lastrowid
    conn.execute(
        """INSERT INTO image_metrics(image_id,face_count,portrait_score,details_json)
        VALUES(?,?,?,?)""",
        (image_id, face_count, score, json.dumps(details or {})),
    )
    return image_id


def _face(conn, image_id: int, vector: np.ndarray, confidence: float = 0.95) -> None:
    conn.execute(
        """INSERT INTO faces(image_id,bbox_json,confidence,landmarks_json,embedding)
        VALUES(?,?,?,?,?)""",
        (image_id, "[0,0,100,100]", confidence, "[]", vector.astype(np.float32).tobytes()),
    )


def test_close_portrait_scores_auto_select_and_group_only_companion_is_not_an_exception(tmp_path: Path):
    db = Database(tmp_path / "jobs.sqlite3")
    shoot = tmp_path / "shoot"; shoot.mkdir()
    roster = tmp_path / "roster.csv"; roster.write_text("Barcode (1)\nA\n")
    job = db.create_job(shoot, roster, load_settings().as_json())
    athlete = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    companion = np.array([0.0, 1.0, 0.0], dtype=np.float32)
    with db.connect() as conn:
        first = _image(conn, job, shoot, "portrait-1.jpg", "A", 1, 0.82,
                       {"expression_ai": 0.95, "expression_label": "happy"})
        second = _image(conn, job, shoot, "portrait-2.jpg", "A", 1, 0.81,
                        {"expression_ai": 0.94, "expression_label": "happy"})
        buddy = _image(conn, job, shoot, "buddy.jpg", "A", 2, 0.70)
        _face(conn, first, athlete)
        _face(conn, second, athlete)
        _face(conn, buddy, athlete)
        _face(conn, buddy, companion)

    _cluster_and_decide(db, job, load_settings())

    assert db.one("SELECT proposed_rating FROM images WHERE id=?", (first,))["proposed_rating"] == 5
    assert db.one("SELECT proposed_rating FROM images WHERE id=?", (buddy,))["proposed_rating"] == 3
    assert db.one("SELECT count(*) n FROM exceptions WHERE job_id=?", (job,))["n"] == 0
    assert db.one(
        "SELECT count(*) n FROM identity_clusters WHERE job_id=? AND subject_type='GROUP_ONLY'", (job,)
    )["n"] == 1


def test_null_cluster_exceptions_are_kept_per_image(tmp_path: Path):
    db = Database(tmp_path / "jobs.sqlite3")
    shoot = tmp_path / "shoot"; shoot.mkdir()
    roster = tmp_path / "roster.csv"; roster.write_text("Barcode (1)\nA\n")
    job = db.create_job(shoot, roster, load_settings().as_json())
    _add_exception(db, job, "A", None, "NO_FACE_DETECTED", [10])
    _add_exception(db, job, "A", None, "NO_FACE_DETECTED", [11])
    assert db.one("SELECT count(*) n FROM exceptions WHERE job_id=?", (job,))["n"] == 2


def test_analysis_report_exists_before_metadata_writes(tmp_path: Path):
    db = Database(tmp_path / "jobs.sqlite3")
    shoot = tmp_path / "shoot"; shoot.mkdir()
    roster = tmp_path / "roster.csv"; roster.write_text("Barcode (1)\nA\n")
    job = db.create_job(shoot, roster, load_settings().as_json())
    path = write_report(db, job, "analysis-report.json")
    report = json.loads(path.read_text())
    assert path == shoot / ".actionshots-qa" / job / "analysis-report.json"
    assert report["metadata_writes"] == 0

