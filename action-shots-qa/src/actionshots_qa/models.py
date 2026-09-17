from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .hardware import HardwareReport, provider_order


@dataclass(frozen=True)
class ModelPaths:
    yunet: Path
    sface: Path

    def validate(self) -> None:
        missing = [str(p) for p in (self.yunet, self.sface) if not Path(p).is_file()]
        if missing:
            raise FileNotFoundError("Missing model(s): " + ", ".join(missing) + ". Run setup_windows.ps1.")


class FaceEngine:
    """YuNet detection plus SFace embeddings; ORT CUDA is primary for embeddings."""

    def __init__(self, paths: ModelPaths, hardware: HardwareReport, score_threshold: float,
                 nms_threshold: float, top_k: int):
        paths.validate()
        self.paths = paths
        self.hardware = hardware
        self.score_threshold = score_threshold
        self.nms_threshold = nms_threshold
        self.top_k = top_k
        self._detector = cv2.FaceDetectorYN.create(
            str(paths.yunet), "", (320, 320), score_threshold, nms_threshold, top_k
        )
        self._detector_lock = threading.Lock()
        self._cpu_recognizer = None
        self._ort_session = None
        if hardware.cuda_active:
            import onnxruntime as ort
            self._ort_session = ort.InferenceSession(str(paths.sface), providers=provider_order(hardware))
            if self._ort_session.get_providers()[0] != "CUDAExecutionProvider":
                raise RuntimeError("SFace session did not activate CUDAExecutionProvider")
        else:
            self._cpu_recognizer = cv2.FaceRecognizerSF.create(str(paths.sface), "")

    def detect(self, bgr: np.ndarray) -> list[np.ndarray]:
        height, width = bgr.shape[:2]
        with self._detector_lock:
            self._detector.setInputSize((width, height))
            _, faces = self._detector.detect(bgr)
        return [] if faces is None else [row.astype(np.float32) for row in faces]

    @staticmethod
    def _aligned_crop(bgr: np.ndarray, face: np.ndarray) -> np.ndarray:
        source = face[4:14].reshape(5, 2).astype(np.float32)
        target = np.array([
            [38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366],
            [41.5493, 92.3655], [70.7299, 92.2041]
        ], dtype=np.float32)
        matrix, _ = cv2.estimateAffinePartial2D(source, target, method=cv2.LMEDS)
        if matrix is None:
            x, y, w, h = [int(v) for v in face[:4]]
            crop = bgr[max(0, y):max(0, y) + max(1, h), max(0, x):max(0, x) + max(1, w)]
            return cv2.resize(crop, (112, 112))
        return cv2.warpAffine(bgr, matrix, (112, 112), flags=cv2.INTER_LINEAR,
                              borderMode=cv2.BORDER_REPLICATE)

    def embed(self, bgr: np.ndarray, face: np.ndarray) -> np.ndarray:
        aligned = self._aligned_crop(bgr, face)
        if self._ort_session is not None:
            # Match OpenCV FaceRecognizerSF exactly: blobFromImage(scale=1,
            # swapRB=True, crop=False). SFace expects raw 0..255 float input.
            rgb = cv2.cvtColor(aligned, cv2.COLOR_BGR2RGB).astype(np.float32)
            tensor = rgb.transpose(2, 0, 1)[None, ...]
            input_name = self._ort_session.get_inputs()[0].name
            output = self._ort_session.run(None, {input_name: tensor})[0].reshape(-1)
        else:
            output = self._cpu_recognizer.feature(aligned).reshape(-1)
        norm = np.linalg.norm(output)
        return (output / norm if norm else output).astype(np.float32)
