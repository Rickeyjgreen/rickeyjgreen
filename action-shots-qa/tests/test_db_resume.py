from pathlib import Path

from actionshots_qa.config import load_settings
from actionshots_qa.db import Database


def test_job_and_image_state_survive_reopen(tmp_path: Path):
    path = tmp_path / "state with spaces" / "jobs.sqlite3"
    source = tmp_path / "shoot with spaces"; source.mkdir()
    roster = tmp_path / "roster file.csv"; roster.write_text("Barcode (1)\nA")
    first = Database(path)
    job = first.create_job(source, roster, load_settings().as_json())
    first.execute("UPDATE jobs SET status='ANALYZING' WHERE id=?", (job,))
    reopened = Database(path)
    assert reopened.one("SELECT status FROM jobs WHERE id=?", (job,))["status"] == "ANALYZING"

