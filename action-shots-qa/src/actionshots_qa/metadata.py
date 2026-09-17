from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .imaging import jpeg_scan_hash


class MetadataError(RuntimeError):
    pass


@dataclass(frozen=True)
class WriteResult:
    rating: int
    copyright_before: str
    copyright_after: str
    scan_hash_before: str
    scan_hash_after: str


def _exiftool_json(exiftool: Path, path: Path) -> dict:
    result = subprocess.run(
        [str(exiftool), "-json", "-Copyright", "-XMP-dc:Rights", "-XMP:Rating",
         "-Microsoft:RatingPercent", str(path)], capture_output=True, text=True, timeout=60
    )
    if result.returncode:
        raise MetadataError(result.stderr.strip() or "ExifTool metadata read failed")
    values = json.loads(result.stdout)
    return values[0] if values else {}


def copyright_value(data: dict) -> str:
    value = data.get("Copyright") or data.get("Rights") or ""
    if isinstance(value, list):
        return " | ".join(str(v).strip() for v in value)
    return str(value).strip()


def write_rating_verified(exiftool: Path, path: Path, rating: int) -> WriteResult:
    if rating not in {0, 1, 2, 3, 4, 5}:
        raise MetadataError(f"Invalid rating: {rating}")
    before = _exiftool_json(exiftool, path)
    copyright_before = copyright_value(before)
    scan_before = jpeg_scan_hash(path)
    percent = {0: 0, 1: 1, 2: 25, 3: 50, 4: 75, 5: 99}[rating]
    backup = Path(str(path) + "_original")
    if backup.exists():
        raise MetadataError(f"Pre-existing ExifTool backup blocks safe write: {backup}")
    command = [str(exiftool), f"-XMP:Rating={rating}", f"-Microsoft:RatingPercent={percent}", str(path)]
    result = subprocess.run(command, capture_output=True, text=True, timeout=120)
    try:
        if result.returncode:
            raise MetadataError(result.stderr.strip() or "ExifTool rating write failed")
        after = _exiftool_json(exiftool, path)
        copyright_after = copyright_value(after)
        scan_after = jpeg_scan_hash(path)
        written = int(after.get("Rating", -1))
        if written != rating:
            raise MetadataError(f"Rating verification failed: expected {rating}, got {written}")
        if copyright_before != copyright_after:
            raise MetadataError("Copyright metadata changed during rating write")
        if scan_before != scan_after:
            raise MetadataError("JPEG compressed image stream changed during rating write")
        backup.unlink(missing_ok=True)
        return WriteResult(rating, copyright_before, copyright_after, scan_before, scan_after)
    except Exception:
        if backup.exists():
            shutil.move(str(backup), str(path))
        raise

