from __future__ import annotations

import json
import threading
import webbrowser
from importlib.resources import files
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

from .config import Settings
from .db import Database, now
from .hardware import HardwareError, diagnose
from .models import FaceEngine, ModelPaths
from .pipeline import analyze_job, build_report, finalize_job


class JobCreate(BaseModel):
    shoot_folder: str
    roster_file: str
    allow_cpu_fallback: bool = False


class ResolveRequest(BaseModel):
    action: str
    image_id: int | None = None
    target_cluster_id: int | None = None


def create_app(db: Database, settings: Settings, model_paths: ModelPaths, exiftool: Path) -> FastAPI:
    app = FastAPI(title="Action Shots Photo QA", version="0.1.0")

    @app.get("/", response_class=HTMLResponse)
    def home():
        return files("actionshots_qa").joinpath("static/index.html").read_text(encoding="utf-8")

    @app.get("/api/hardware")
    def hardware(allow_cpu_fallback: bool = False):
        try:
            return diagnose(require_cuda=True, allow_cpu_fallback=allow_cpu_fallback).as_dict()
        except HardwareError as exc:
            raise HTTPException(409, str(exc))

    @app.get("/api/jobs")
    def jobs():
        return db.query("SELECT * FROM jobs ORDER BY created_at DESC")

    @app.post("/api/jobs")
    def create_job(request: JobCreate, background: BackgroundTasks):
        source, roster = Path(request.shoot_folder), Path(request.roster_file)
        if not source.is_dir():
            raise HTTPException(400, f"Shoot folder not found: {source}")
        if not roster.is_file():
            raise HTTPException(400, f"Roster file not found: {roster}")
        try:
            report = diagnose(require_cuda=True, allow_cpu_fallback=request.allow_cpu_fallback)
            # A provider name alone is insufficient: constructing a real model
            # session proves CUDA/cuDNN DLLs can load on this workstation.
            FaceEngine(model_paths, report, settings.face_score_threshold,
                       settings.nms_threshold, settings.top_k)
        except HardwareError as exc:
            raise HTTPException(409, str(exc))
        except Exception as exc:
            raise HTTPException(409, f"GPU/model startup check failed: {exc}")
        job_id = db.create_job(source, roster, settings.as_json())
        background.add_task(analyze_job, db, job_id, model_paths, report, settings)
        return {"job_id": job_id, "status": "ANALYZING", "hardware": report.as_dict()}

    @app.post("/api/jobs/{job_id}/resume")
    def resume(job_id: str, allow_cpu_fallback: bool, background: BackgroundTasks):
        if not db.one("SELECT id FROM jobs WHERE id=?", (job_id,)):
            raise HTTPException(404, "Job not found")
        try:
            report = diagnose(require_cuda=True, allow_cpu_fallback=allow_cpu_fallback)
        except HardwareError as exc:
            raise HTTPException(409, str(exc))
        background.add_task(analyze_job, db, job_id, model_paths, report, settings)
        return {"job_id": job_id, "status": "ANALYZING"}

    @app.get("/api/jobs/{job_id}")
    def job(job_id: str):
        if not db.one("SELECT id FROM jobs WHERE id=?", (job_id,)):
            raise HTTPException(404, "Job not found")
        return build_report(db, job_id)

    @app.get("/api/jobs/{job_id}/exceptions")
    def exceptions(job_id: str):
        rows = db.query("SELECT * FROM exceptions WHERE job_id=? AND status='OPEN' ORDER BY id", (job_id,))
        for row in rows:
            ids = json.loads(row["candidate_images_json"])
            row["candidates"] = db.query(
                f"SELECT i.id,i.relative_path,i.proxy_path,m.portrait_score,m.face_count FROM images i LEFT JOIN image_metrics m ON m.image_id=i.id WHERE i.id IN ({','.join('?' for _ in ids)})",
                tuple(ids)) if ids else []
        return rows

    @app.get("/api/images/{image_id}/proxy")
    def proxy(image_id: int):
        row = db.one("SELECT proxy_path FROM images WHERE id=?", (image_id,))
        if not row or not Path(row["proxy_path"]).is_file():
            raise HTTPException(404, "Proxy not found")
        return FileResponse(row["proxy_path"], media_type="image/jpeg")

    @app.post("/api/exceptions/{exception_id}/resolve")
    def resolve(exception_id: int, request: ResolveRequest):
        exception = db.one("SELECT * FROM exceptions WHERE id=? AND status='OPEN'", (exception_id,))
        if not exception:
            raise HTTPException(404, "Open exception not found")
        candidates = json.loads(exception["candidate_images_json"])
        if request.action == "winner":
            if request.image_id not in candidates:
                raise HTTPException(400, "Winner must be one of the exception candidates")
            db.execute("UPDATE images SET proposed_rating=5 WHERE id=?", (request.image_id,))
            db.execute("INSERT INTO decisions(job_id,image_id,cluster_id,decision,rating,confidence,reason,source,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                       (exception["job_id"], request.image_id, exception["cluster_id"], "WINNER", 5, 1.0, "operator choice", "HUMAN", now()))
        elif request.action == "group":
            if request.image_id not in candidates:
                raise HTTPException(400, "Group image must be one of the exception candidates")
            db.execute("UPDATE images SET proposed_rating=3 WHERE id=?", (request.image_id,))
        elif request.action == "skip":
            pass
        elif request.action == "split":
            if not exception["cluster_id"] or request.image_id not in candidates:
                raise HTTPException(400, "Split requires a cluster exception and candidate image")
            cluster = db.one("SELECT * FROM identity_clusters WHERE id=?", (exception["cluster_id"],))
            next_number = db.one("SELECT coalesce(max(cluster_number),0)+1 n FROM identity_clusters WHERE job_id=? AND copyright_code=?",
                                 (exception["job_id"], cluster["copyright_code"]))["n"]
            with db.connect() as conn:
                cursor = conn.execute("INSERT INTO identity_clusters(job_id,copyright_code,cluster_number,confidence) VALUES(?,?,?,1)",
                                      (exception["job_id"], cluster["copyright_code"], next_number))
                new_cluster_id = cursor.lastrowid
                conn.execute("UPDATE faces SET identity_cluster_id=? WHERE image_id=? AND identity_cluster_id=?",
                             (new_cluster_id, request.image_id, exception["cluster_id"]))
                stamp = now()
                conn.execute("""INSERT INTO exceptions(job_id,copyright_code,cluster_id,reason,candidate_images_json,
                             status,created_at,updated_at) VALUES(?,?,?,?,?,'OPEN',?,?)""",
                             (exception["job_id"], cluster["copyright_code"], new_cluster_id,
                              "SPLIT_IDENTITY_WINNER", json.dumps([request.image_id]), stamp, stamp))
                remaining_candidates = [value for value in candidates if value != request.image_id]
                if remaining_candidates:
                    conn.execute("UPDATE exceptions SET candidate_images_json=?,resolution_json=?,updated_at=? WHERE id=?",
                                 (json.dumps(remaining_candidates), request.model_dump_json(), stamp, exception_id))
                else:
                    conn.execute("UPDATE exceptions SET status='RESOLVED',resolution_json=?,updated_at=? WHERE id=?",
                                 (request.model_dump_json(), stamp, exception_id))
            remaining = db.one("SELECT count(*) n FROM exceptions WHERE job_id=? AND status='OPEN'", (exception["job_id"],))["n"]
            return {"ok": True, "remaining": remaining}
        elif request.action == "merge":
            if not exception["cluster_id"] or not request.target_cluster_id:
                raise HTTPException(400, "Merge requires current and target cluster IDs")
            db.execute("UPDATE faces SET identity_cluster_id=? WHERE identity_cluster_id=?",
                       (request.target_cluster_id, exception["cluster_id"]))
            db.execute("DELETE FROM identity_clusters WHERE id=?", (exception["cluster_id"],))
        else:
            raise HTTPException(400, "Unknown action")
        db.execute("UPDATE exceptions SET status='RESOLVED',resolution_json=?,updated_at=? WHERE id=?",
                   (request.model_dump_json(), now(), exception_id))
        remaining = db.one("SELECT count(*) n FROM exceptions WHERE job_id=? AND status='OPEN'", (exception["job_id"],))["n"]
        if not remaining:
            db.set_job_status(exception["job_id"], "READY_TO_WRITE")
        return {"ok": True, "remaining": remaining}

    @app.post("/api/jobs/{job_id}/finalize")
    def finalize(job_id: str):
        try:
            return finalize_job(db, job_id, exiftool)
        except Exception as exc:
            raise HTTPException(409, str(exc))

    return app


def open_browser_later(url: str) -> None:
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
