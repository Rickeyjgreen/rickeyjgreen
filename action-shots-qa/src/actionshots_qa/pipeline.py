from __future__ import annotations

import json
import math
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from pathlib import Path
from typing import Iterator

import numpy as np

from .config import Settings
from .db import Database, now
from .hardware import HardwareReport
from .imaging import face_metrics, image_files, metric_json, prepare_image
from .metadata import write_rating_verified
from .models import FaceEngine, ModelPaths
from .roster import load_roster_codes


def _bounded_prepared(paths: list[Path], root: Path, cache: Path, settings: Settings) -> Iterator:
    with ThreadPoolExecutor(max_workers=settings.decode_workers) as pool:
        iterator = iter(paths)
        pending = set()
        for _ in range(min(settings.decode_queue_size, len(paths))):
            try:
                path = next(iterator)
            except StopIteration:
                break
            pending.add(pool.submit(prepare_image, path, root, cache, settings.proxy_max_edge))
        while pending:
            done, pending = wait(pending, return_when=FIRST_COMPLETED)
            for future in done:
                yield future.result()
                try:
                    path = next(iterator)
                except StopIteration:
                    continue
                pending.add(pool.submit(prepare_image, path, root, cache, settings.proxy_max_edge))


def _score(metrics: dict[str, float], base: dict[str, float], detector: float,
           weights: dict[str, float]) -> float:
    features = {
        "sharpness": metrics["sharpness"], "exposure": base["exposure"],
        "face_size": metrics["face_size"], "pose": metrics["pose"],
        "expression": metrics["expression"], "eye": metrics["eye"],
        "framing": metrics["framing"], "detector": detector,
    }
    return sum(features[k] * float(weights.get(k, 0)) for k in features)


def analyze_job(db: Database, job_id: str, model_paths: ModelPaths, hardware: HardwareReport,
                settings: Settings) -> None:
    job = db.one("SELECT * FROM jobs WHERE id=?", (job_id,))
    if not job:
        raise KeyError(job_id)
    root = Path(job["source_path"])
    roster = load_roster_codes(Path(job["roster_path"]))
    work = root / ".actionshots-qa" / job_id
    cache = work / "proxies"
    db.set_job_status(job_id, "ANALYZING")
    db.audit(job_id, "HARDWARE", True, hardware.as_dict())
    started = time.perf_counter()
    try:
        existing = {r["relative_path"]: r for r in db.query("SELECT * FROM images WHERE job_id=?", (job_id,))}
        paths = image_files(root)
        db.audit(job_id, "IMAGE_DISCOVERY", True, {"total_images": len(paths)})
        engine = FaceEngine(model_paths, hardware, settings.face_score_threshold,
                            settings.nms_threshold, settings.top_k)
        todo = [p for p in paths if str(p.relative_to(root)).replace("\\", "/") not in existing
                or existing[str(p.relative_to(root)).replace("\\", "/")]["analysis_status"] != "DONE"]
        for prepared in _bounded_prepared(todo, root, cache, settings):
            if not prepared.copyright_code:
                code_state = "MISSING_CODE"
            elif prepared.copyright_code not in roster.codes:
                code_state = "UNMATCHED_CODE"
            else:
                code_state = "MATCHED"
            with db.connect() as conn:
                conn.execute(
                    """INSERT INTO images(job_id,relative_path,absolute_path,copyright_code,capture_time,
                    width,height,file_size,file_sha256,scan_sha256_before,copyright_before,proxy_path,
                    analysis_status,current_rating,proposed_rating) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
                    ON CONFLICT(job_id,relative_path) DO UPDATE SET file_sha256=excluded.file_sha256,
                    scan_sha256_before=excluded.scan_sha256_before,proxy_path=excluded.proxy_path,
                    copyright_code=excluded.copyright_code,analysis_status='PROCESSING'""",
                    (job_id, prepared.relative_path, str(prepared.path), prepared.copyright_code,
                     prepared.capture_time, prepared.width, prepared.height, prepared.file_size,
                     prepared.file_sha256, prepared.scan_sha256, prepared.copyright_code,
                     str(prepared.proxy_path), "PROCESSING", prepared.current_rating),
                )
                image_id = conn.execute(
                    "SELECT id FROM images WHERE job_id=? AND relative_path=?",
                    (job_id, prepared.relative_path)).fetchone()[0]
                conn.execute("DELETE FROM faces WHERE image_id=?", (image_id,))
                faces = engine.detect(prepared.proxy_bgr)
                best_metrics = dict(prepared.base_metrics)
                best_score = 0.0
                for face in faces:
                    embedding = engine.embed(prepared.proxy_bgr, face)
                    metrics = face_metrics(prepared.proxy_bgr, face)
                    portrait = _score(metrics, prepared.base_metrics, float(face[14]), settings.weights)
                    if portrait >= best_score:
                        best_score, best_metrics = portrait, {**prepared.base_metrics, **metrics}
                    conn.execute(
                        "INSERT INTO faces(image_id,bbox_json,confidence,landmarks_json,embedding) VALUES(?,?,?,?,?)",
                        (image_id, json.dumps([float(v) for v in face[:4]]), float(face[14]),
                         json.dumps([float(v) for v in face[4:14]]), embedding.tobytes()),
                    )
                proxy_h, proxy_w = prepared.proxy_bgr.shape[:2]
                group_score = (sum(float(face[2] * face[3]) for face in faces)
                               / max(1.0, float(proxy_w * proxy_h)))
                conn.execute(
                    """INSERT OR REPLACE INTO image_metrics(image_id,face_count,sharpness,exposure,clipping,
                    face_size_score,pose_score,expression_score,eye_score,framing_score,group_score,
                    portrait_score,details_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (image_id, len(faces), prepared.base_metrics["sharpness"], prepared.base_metrics["exposure"],
                     prepared.base_metrics["clipping"], best_metrics.get("face_size"), best_metrics.get("pose"),
                     best_metrics.get("expression"), best_metrics.get("eye"), best_metrics.get("framing"),
                     group_score, best_score, metric_json(best_metrics)),
                )
                conn.execute("UPDATE images SET analysis_status='DONE' WHERE id=?", (image_id,))
            if code_state != "MATCHED":
                _add_exception(db, job_id, prepared.copyright_code, None, code_state, [image_id])
        _cluster_and_decide(db, job_id, settings)
        open_count = db.one("SELECT count(*) AS n FROM exceptions WHERE job_id=? AND status='OPEN'", (job_id,))["n"]
        status = "NEEDS_REVIEW" if open_count else "READY_TO_WRITE"
        db.set_job_status(job_id, status)
        db.audit(job_id, "ANALYSIS_COMPLETE", True, {
            "seconds": round(time.perf_counter() - started, 3), "images": len(paths),
            "roster_codes": len(roster.codes), "open_exceptions": open_count,
        })
    except Exception as exc:
        db.set_job_status(job_id, "FAILED", str(exc))
        db.audit(job_id, "ANALYSIS_FAILED", False, {"error": str(exc)})
        raise


def _add_exception(db: Database, job_id: str, code: str | None, cluster_id: int | None,
                   reason: str, candidates: list[int]) -> None:
    existing = db.one(
        "SELECT id FROM exceptions WHERE job_id=? AND reason=? AND ifnull(cluster_id,0)=ifnull(?,0) AND status='OPEN'",
        (job_id, reason, cluster_id),
    )
    if existing:
        return
    stamp = now()
    db.execute(
        """INSERT INTO exceptions(job_id,copyright_code,cluster_id,reason,candidate_images_json,
        status,created_at,updated_at) VALUES(?,?,?,?,?,'OPEN',?,?)""",
        (job_id, code, cluster_id, reason, json.dumps(candidates), stamp, stamp),
    )


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))


def _cluster_and_decide(db: Database, job_id: str, settings: Settings) -> None:
    # Rebuilding after an interrupted analysis must be deterministic. Human
    # decisions are never silently discarded; a reviewed job is not reclustered.
    human_count = db.one("SELECT count(*) n FROM decisions WHERE job_id=? AND source='HUMAN'", (job_id,))["n"]
    if human_count:
        raise RuntimeError("This job already has human review decisions and cannot be reclustered automatically")
    db.execute("DELETE FROM exceptions WHERE job_id=? AND status='OPEN'", (job_id,))
    db.execute("UPDATE exceptions SET cluster_id=NULL WHERE job_id=?", (job_id,))
    db.execute("DELETE FROM decisions WHERE job_id=? AND source IN ('AUTO','RULE')", (job_id,))
    db.execute("UPDATE faces SET identity_cluster_id=NULL WHERE image_id IN (SELECT id FROM images WHERE job_id=?)",
               (job_id,))
    db.execute("DELETE FROM identity_clusters WHERE job_id=?", (job_id,))
    codes = db.query("SELECT DISTINCT copyright_code FROM images WHERE job_id=? AND copyright_code IS NOT NULL AND copyright_code!=''", (job_id,))
    for code_row in codes:
        code = code_row["copyright_code"]
        faces = db.query(
            """SELECT f.*, i.copyright_code FROM faces f JOIN images i ON i.id=f.image_id
            WHERE i.job_id=? AND i.copyright_code=? ORDER BY f.id""", (job_id, code))
        clusters: list[dict] = []
        for face in faces:
            vector = np.frombuffer(face["embedding"], dtype=np.float32)
            choices = [(idx, _cosine(vector, c["centroid"])) for idx, c in enumerate(clusters)
                       if face["image_id"] not in c["image_ids"]]
            best = max(choices, key=lambda item: item[1]) if choices else None
            if best and best[1] >= settings.cluster_cosine_threshold:
                cluster = clusters[best[0]]
                cluster["vectors"].append(vector)
                cluster["face_ids"].append(face["id"])
                cluster["image_ids"].add(face["image_id"])
                center = np.mean(cluster["vectors"], axis=0)
                cluster["centroid"] = center / max(np.linalg.norm(center), 1e-8)
            else:
                clusters.append({"vectors": [vector], "centroid": vector,
                                 "face_ids": [face["id"]], "image_ids": {face["image_id"]}})
        for number, cluster in enumerate(clusters, 1):
            confidence = 1.0 if len(cluster["vectors"]) == 1 else float(np.mean([
                _cosine(v, cluster["centroid"]) for v in cluster["vectors"]]))
            with db.connect() as conn:
                cursor = conn.execute(
                    "INSERT INTO identity_clusters(job_id,copyright_code,cluster_number,confidence) VALUES(?,?,?,?)",
                    (job_id, code, number, confidence))
                cluster_id = cursor.lastrowid
                conn.executemany("UPDATE faces SET identity_cluster_id=? WHERE id=?",
                                 [(cluster_id, face_id) for face_id in cluster["face_ids"]])
    # Rule: confidently detected multi-face frames are buddy/group frames.
    group_rows = db.query(
        """SELECT i.id,i.copyright_code,m.face_count,m.group_score area_ratio,
        (SELECT min(confidence) FROM faces WHERE image_id=i.id) min_conf
        FROM images i JOIN image_metrics m ON m.image_id=i.id WHERE i.job_id=? AND m.face_count>=2""", (job_id,))
    for row in group_rows:
        if (row["min_conf"] or 0) >= settings.group_min_face_confidence and (row["area_ratio"] or 0) >= settings.group_min_combined_face_area:
            db.execute("UPDATE images SET proposed_rating=3 WHERE id=?", (row["id"],))
            db.execute("INSERT INTO decisions(job_id,image_id,decision,rating,confidence,reason,source,created_at) VALUES(?,?,?,?,?,?,?,?)",
                       (job_id, row["id"], "GROUP", 3, float(row["min_conf"]), "multiple confident faces", "RULE", now()))
        else:
            _add_exception(db, job_id, row["copyright_code"], None, "UNCERTAIN_GROUP", [row["id"]])
    # One winner per identity cluster, using only single-face portrait frames.
    for cluster in db.query("SELECT * FROM identity_clusters WHERE job_id=?", (job_id,)):
        candidates = db.query(
            """SELECT DISTINCT i.id,i.copyright_code,m.portrait_score,f.confidence
            FROM faces f JOIN images i ON i.id=f.image_id JOIN image_metrics m ON m.image_id=i.id
            WHERE f.identity_cluster_id=? AND m.face_count=1 ORDER BY m.portrait_score DESC""",
            (cluster["id"],))
        if not candidates:
            all_images = db.query("SELECT DISTINCT image_id AS id FROM faces WHERE identity_cluster_id=?", (cluster["id"],))
            _add_exception(db, job_id, cluster["copyright_code"], cluster["id"],
                           "NO_PORTRAIT_CANDIDATE", [r["id"] for r in all_images])
            continue
        top = candidates[0]
        runner = candidates[1]["portrait_score"] if len(candidates) > 1 else 0.0
        margin = float(top["portrait_score"] or 0) - float(runner or 0)
        confidence = min(1.0, 0.55 * float(top["portrait_score"] or 0) + 0.45 * min(1.0, margin / 0.2))
        safe = (float(top["portrait_score"] or 0) >= settings.winner_min_score
                and float(top["confidence"] or 0) >= settings.winner_min_detection_confidence
                and (margin >= settings.winner_min_margin or len(candidates) == 1))
        if safe:
            db.execute("UPDATE images SET proposed_rating=5 WHERE id=?", (top["id"],))
            db.execute("INSERT INTO decisions(job_id,image_id,cluster_id,decision,rating,confidence,reason,source,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                       (job_id, top["id"], cluster["id"], "WINNER", 5, confidence,
                        f"score={top['portrait_score']:.3f};margin={margin:.3f}", "AUTO", now()))
        else:
            _add_exception(db, job_id, cluster["copyright_code"], cluster["id"], "CLOSE_PORTRAIT_RACE",
                           [r["id"] for r in candidates[:settings.max_review_candidates]])
    no_faces = db.query("""SELECT i.id,i.copyright_code FROM images i JOIN image_metrics m ON m.image_id=i.id
                            WHERE i.job_id=? AND m.face_count=0""", (job_id,))
    for row in no_faces:
        _add_exception(db, job_id, row["copyright_code"], None, "NO_FACE_DETECTED", [row["id"]])


def finalize_job(db: Database, job_id: str, exiftool: Path) -> dict:
    open_count = db.one("SELECT count(*) AS n FROM exceptions WHERE job_id=? AND status='OPEN'", (job_id,))["n"]
    if open_count:
        raise RuntimeError(f"{open_count} exceptions remain open")
    rows = db.query("SELECT * FROM images WHERE job_id=? AND proposed_rating IS NOT NULL ORDER BY id", (job_id,))
    db.set_job_status(job_id, "WRITING")
    written = 0
    try:
        for row in rows:
            result = write_rating_verified(exiftool, Path(row["absolute_path"]), int(row["proposed_rating"]))
            db.audit(job_id, "RATING_WRITE", True, result.__dict__, row["id"])
            db.execute("UPDATE images SET current_rating=? WHERE id=?", (result.rating, row["id"]))
            written += 1
        report = build_report(db, job_id)
        report_path = Path(db.one("SELECT source_path FROM jobs WHERE id=?", (job_id,))["source_path"]) / ".actionshots-qa" / job_id / "final-report.json"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        db.set_job_status(job_id, "COMPLETE")
        return {**report, "report_path": str(report_path), "written": written}
    except Exception as exc:
        db.set_job_status(job_id, "WRITE_FAILED", str(exc))
        db.audit(job_id, "WRITE_FAILED", False, {"error": str(exc), "written_before_failure": written})
        raise


def build_report(db: Database, job_id: str) -> dict:
    def count(sql: str) -> int:
        return int(db.one(sql, (job_id,))["n"])
    return {
        "job": db.one("SELECT id,status,source_path,roster_path,pipeline_version,created_at,updated_at,error FROM jobs WHERE id=?", (job_id,)),
        "images": count("SELECT count(*) n FROM images WHERE job_id=?"),
        "faces": count("SELECT count(*) n FROM faces WHERE image_id IN (SELECT id FROM images WHERE job_id=?)"),
        "identity_clusters": count("SELECT count(*) n FROM identity_clusters WHERE job_id=?"),
        "five_star": count("SELECT count(*) n FROM images WHERE job_id=? AND proposed_rating=5"),
        "three_star_groups": count("SELECT count(*) n FROM images WHERE job_id=? AND proposed_rating=3"),
        "open_exceptions": count("SELECT count(*) n FROM exceptions WHERE job_id=? AND status='OPEN'"),
        "failed_audits": count("SELECT count(*) n FROM audit_events WHERE job_id=? AND ok=0"),
    }
