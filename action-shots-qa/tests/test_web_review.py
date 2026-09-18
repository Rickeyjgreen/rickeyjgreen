import json
from pathlib import Path

from fastapi.testclient import TestClient

from actionshots_qa.config import load_settings
from actionshots_qa.db import Database, now
from actionshots_qa.models import ModelPaths
from actionshots_qa.web import create_app


def test_exception_candidates_preserve_ranked_order(tmp_path: Path):
    db = Database(tmp_path / "jobs.sqlite3")
    shoot = tmp_path / "shoot"; shoot.mkdir()
    roster = tmp_path / "roster.csv"; roster.write_text("Barcode (1)\nA\n")
    job = db.create_job(shoot, roster, load_settings().as_json())
    with db.connect() as conn:
        ids = []
        for name, score in (("low.jpg", 0.70), ("high.jpg", 0.90)):
            cursor = conn.execute(
                """INSERT INTO images(job_id,relative_path,absolute_path,copyright_code,
                proxy_path,analysis_status,proposed_rating) VALUES(?,?,?,?,?,?,0)""",
                (job, name, str(shoot / name), "A", str(shoot / name), "DONE"),
            )
            ids.append(cursor.lastrowid)
            conn.execute("INSERT INTO image_metrics(image_id,face_count,portrait_score) VALUES(?,?,?)",
                         (cursor.lastrowid, 1, score))
        stamp = now()
        conn.execute(
            """INSERT INTO exceptions(job_id,copyright_code,reason,candidate_images_json,
            status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)""",
            (job, "A", "EXPRESSION_REVIEW", json.dumps([ids[1], ids[0]]), "OPEN", stamp, stamp),
        )
    paths = ModelPaths(tmp_path / "yunet.onnx", tmp_path / "sface.onnx", tmp_path / "expression.onnx")
    client = TestClient(create_app(db, load_settings(), paths, tmp_path / "exiftool"))
    response = client.get(f"/api/jobs/{job}/exceptions")
    assert response.status_code == 200
    assert [candidate["id"] for candidate in response.json()[0]["candidates"]] == [ids[1], ids[0]]

