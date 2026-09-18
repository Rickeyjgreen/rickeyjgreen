from __future__ import annotations

import argparse
import os
from pathlib import Path

import uvicorn

from .config import load_settings
from .db import Database
from .hardware import diagnose, report_json
from .models import FaceEngine, ModelPaths
from .web import create_app, open_browser_later


def _paths(root: Path) -> tuple[ModelPaths, Path]:
    models = root / "models"
    exiftool = models / ("exiftool.exe" if os.name == "nt" else "exiftool")
    return ModelPaths(models / "face_detection_yunet_2023mar.onnx",
                      models / "face_recognition_sface_2021dec.onnx"), exiftool


def main() -> None:
    parser = argparse.ArgumentParser(prog="actionshots-qa")
    sub = parser.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve", help="Start the local review app")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", default=8765, type=int)
    serve.add_argument("--root", type=Path, default=Path.cwd())
    serve.add_argument("--config", type=Path)
    diagnose_parser = sub.add_parser("diagnose", help="Verify NVIDIA CUDA and CPU fallback")
    diagnose_parser.add_argument("--allow-cpu-fallback", action="store_true")
    diagnose_parser.add_argument("--root", type=Path, default=Path.cwd())
    args = parser.parse_args()
    if args.command == "diagnose":
        try:
            report = diagnose(require_cuda=True, allow_cpu_fallback=args.allow_cpu_fallback)
            model_paths, _ = _paths(args.root.resolve())
            settings = load_settings()
            FaceEngine(model_paths, report, settings.face_score_threshold,
                       settings.nms_threshold, settings.top_k)
            print(report_json(report))
            print("MODEL_STARTUP_CHECK=PASS")
        except Exception as exc:
            print(f"MODEL_STARTUP_CHECK=FAIL\n{exc}")
            raise SystemExit(1)
        return
    root = args.root.resolve()
    model_paths, exiftool = _paths(root)
    db = Database(root / ".actionshots-qa" / "jobs.sqlite3")
    app = create_app(db, load_settings(args.config), model_paths, exiftool)
    url = f"http://{args.host}:{args.port}"
    open_browser_later(url)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
