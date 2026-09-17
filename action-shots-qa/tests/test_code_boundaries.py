from pathlib import Path

import numpy as np

from actionshots_qa.config import load_settings
from actionshots_qa.db import Database
from actionshots_qa.pipeline import _cluster_and_decide, _cosine


def test_similarity_is_only_a_metric_not_a_global_identity():
    # Pipeline queries faces one Copyright code at a time; similarity cannot bridge codes.
    assert _cosine(np.array([1, 0], dtype=np.float32), np.array([1, 0], dtype=np.float32)) == 1.0


def test_identical_embeddings_never_cross_copyright_codes_and_rebuild_is_deterministic(tmp_path: Path):
    db = Database(tmp_path / "jobs.sqlite3")
    shoot = tmp_path / "shoot"; shoot.mkdir()
    roster = tmp_path / "roster.csv"; roster.write_text("Barcode (1)\nA\nB\n")
    job = db.create_job(shoot, roster, load_settings().as_json())
    vector = np.array([1.0, 0.0, 0.0], dtype=np.float32).tobytes()
    with db.connect() as conn:
        for code in ("A", "B"):
            for index, score in enumerate((0.90, 0.70)):
                cursor = conn.execute(
                    """INSERT INTO images(job_id,relative_path,absolute_path,copyright_code,
                    analysis_status,proposed_rating) VALUES(?,?,?,?,?,0)""",
                    (job, f"{code}-{index}.jpg", str(shoot / f"{code}-{index}.jpg"), code, "DONE"))
                image_id = cursor.lastrowid
                conn.execute("INSERT INTO faces(image_id,bbox_json,confidence,landmarks_json,embedding) VALUES(?,?,?,?,?)",
                             (image_id, "[0,0,100,100]", 0.99, "[]", vector))
                conn.execute("INSERT INTO image_metrics(image_id,face_count,portrait_score) VALUES(?,?,?)",
                             (image_id, 1, score))
    settings = load_settings()
    _cluster_and_decide(db, job, settings)
    first = db.query("SELECT copyright_code,cluster_number FROM identity_clusters WHERE job_id=? ORDER BY copyright_code", (job,))
    assert first == [{"copyright_code": "A", "cluster_number": 1},
                     {"copyright_code": "B", "cluster_number": 1}]
    assert db.one("SELECT count(*) n FROM images WHERE job_id=? AND proposed_rating=5", (job,))["n"] == 2
    _cluster_and_decide(db, job, settings)
    second = db.query("SELECT copyright_code,cluster_number FROM identity_clusters WHERE job_id=? ORDER BY copyright_code", (job,))
    assert second == first

