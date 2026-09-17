from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import ExifTags, Image, ImageOps


JPEG_EXTENSIONS = {".jpg", ".jpeg"}
COPYRIGHT_TAG = next((k for k, v in ExifTags.TAGS.items() if v == "Copyright"), 33432)


@dataclass(frozen=True)
class PreparedImage:
    path: Path
    relative_path: str
    proxy_path: Path
    proxy_bgr: np.ndarray
    width: int
    height: int
    file_size: int
    file_sha256: str
    scan_sha256: str
    copyright_code: str
    capture_time: str | None
    current_rating: int | None
    base_metrics: dict[str, float]


def image_files(root: Path) -> list[Path]:
    return sorted(p for p in Path(root).rglob("*")
                  if p.is_file() and p.suffix.lower() in JPEG_EXTENSIONS
                  and ".actionshots-qa" not in p.parts)


def sha256_file(path: Path, chunk: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(chunk), b""):
            digest.update(block)
    return digest.hexdigest()


def jpeg_scan_hash(path: Path) -> str:
    """Hash JPEG scan headers/data only, excluding metadata-bearing pre-SOS segments."""
    data = path.read_bytes()
    if not data.startswith(b"\xff\xd8"):
        raise ValueError(f"Not a JPEG: {path}")
    pos = 2
    while pos + 4 <= len(data):
        if data[pos] != 0xFF:
            raise ValueError(f"Invalid JPEG marker layout: {path}")
        while pos < len(data) and data[pos] == 0xFF:
            pos += 1
        marker = data[pos]
        pos += 1
        if marker == 0xDA:  # Start of Scan. Include SOS header and all entropy data.
            return hashlib.sha256(data[pos - 2:]).hexdigest()
        if marker in {0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
            continue
        if pos + 2 > len(data):
            break
        length = int.from_bytes(data[pos:pos + 2], "big")
        if length < 2:
            raise ValueError(f"Invalid JPEG segment length: {path}")
        pos += length
    raise ValueError(f"JPEG has no Start of Scan marker: {path}")


def _text(value: object) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace").strip("\x00 ")
    return str(value or "").strip()


def read_pillow_metadata(path: Path) -> tuple[str, str | None, int | None, tuple[int, int]]:
    with Image.open(path) as image:
        exif = image.getexif()
        copyright_code = _text(exif.get(COPYRIGHT_TAG))
        capture = _text(exif.get(36867) or exif.get(306)) or None
        rating = exif.get(18249)
        return copyright_code, capture, int(rating) if rating is not None else None, image.size


def _base_metrics(bgr: np.ndarray) -> dict[str, float]:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    mean = float(gray.mean()) / 255.0
    exposure = max(0.0, 1.0 - abs(mean - 0.52) / 0.52)
    clipping = float(((gray < 5) | (gray > 250)).mean())
    sharp_raw = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    sharpness = min(1.0, np.log1p(sharp_raw) / np.log(1001.0))
    return {"sharpness": sharpness, "exposure": exposure, "clipping": clipping}


def prepare_image(path: Path, root: Path, cache_root: Path, max_edge: int) -> PreparedImage:
    code, capture, rating, (width, height) = read_pillow_metadata(path)
    relative = str(path.relative_to(root)).replace("\\", "/")
    proxy_path = cache_root / (hashlib.sha1(relative.encode()).hexdigest() + ".jpg")
    proxy_path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(path) as raw:
        image = ImageOps.exif_transpose(raw).convert("RGB")
        image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
        rgb = np.asarray(image)
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        if not proxy_path.exists():
            image.save(proxy_path, "JPEG", quality=88, optimize=True)
    return PreparedImage(
        path, relative, proxy_path, bgr, width, height, path.stat().st_size,
        sha256_file(path), jpeg_scan_hash(path), code, capture, rating, _base_metrics(bgr)
    )


def face_metrics(image: np.ndarray, face: np.ndarray) -> dict[str, float]:
    h, w = image.shape[:2]
    x, y, bw, bh = [float(v) for v in face[:4]]
    landmarks = face[4:14].reshape(5, 2)
    x1, y1 = max(0, int(x)), max(0, int(y))
    x2, y2 = min(w, int(x + bw)), min(h, int(y + bh))
    crop = image[y1:y2, x1:x2]
    if crop.size:
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        sharpness = min(1.0, np.log1p(cv2.Laplacian(gray, cv2.CV_64F).var()) / np.log(1401.0))
    else:
        sharpness = 0.0
    face_size = min(1.0, (bw * bh / max(1.0, w * h)) / 0.24)
    left_eye, right_eye, nose, left_mouth, right_mouth = landmarks
    eye_distance = max(1.0, float(np.linalg.norm(right_eye - left_eye)))
    eye_mid = (left_eye + right_eye) / 2
    pose = max(0.0, 1.0 - abs(float(nose[0] - eye_mid[0])) / (eye_distance * 0.55))
    mouth_width = float(np.linalg.norm(right_mouth - left_mouth)) / eye_distance
    expression = min(1.0, max(0.0, (mouth_width - 0.62) / 0.42))
    eyes_inside = all(x <= p[0] <= x + bw and y <= p[1] <= y + bh for p in (left_eye, right_eye))
    eye = 1.0 if eyes_inside else 0.0
    margin = min(x, y, w - (x + bw), h - (y + bh))
    framing = min(1.0, max(0.0, margin / max(1.0, min(w, h) * 0.08) + 0.5))
    return {
        "sharpness": sharpness, "face_size": face_size, "pose": pose,
        "expression": expression, "eye": eye, "framing": framing,
    }


def metric_json(metrics: dict[str, float]) -> str:
    return json.dumps({k: round(float(v), 6) for k, v in metrics.items()}, sort_keys=True)

