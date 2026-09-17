from __future__ import annotations

import json
import subprocess
from dataclasses import asdict, dataclass
from typing import Any


class HardwareError(RuntimeError):
    pass


@dataclass(frozen=True)
class HardwareReport:
    nvidia_name: str | None
    dedicated_vram_mb: int | None
    ort_available_providers: list[str]
    requested_provider: str
    cpu_fallback_available: bool
    cuda_active: bool
    warning: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _nvidia_smi() -> tuple[str | None, int | None, str | None]:
    command = ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=10, check=True)
        first = result.stdout.strip().splitlines()[0]
        name, memory = [part.strip() for part in first.rsplit(",", 1)]
        return name, int(memory), None
    except Exception as exc:
        return None, None, f"nvidia-smi unavailable: {exc}"


def diagnose(require_cuda: bool = True, allow_cpu_fallback: bool = False) -> HardwareReport:
    try:
        import onnxruntime as ort
        providers = list(ort.get_available_providers())
    except Exception as exc:
        raise HardwareError(f"ONNX Runtime failed to import: {exc}") from exc
    name, vram, warning = _nvidia_smi()
    cuda = "CUDAExecutionProvider" in providers and bool(name)
    cpu = "CPUExecutionProvider" in providers
    if name and "NVIDIA" not in name.upper() and "GEFORCE" not in name.upper():
        raise HardwareError(f"Unexpected accelerator reported by nvidia-smi: {name}")
    if require_cuda and not cuda and not allow_cpu_fallback:
        raise HardwareError(
            "CUDA is not active. Install/repair CUDA 12.x + cuDNN 9.x, then rerun Diagnose. "
            "CPU fallback is never enabled silently."
        )
    requested = "CUDAExecutionProvider" if cuda else "CPUExecutionProvider"
    return HardwareReport(name, vram, providers, requested, cpu, cuda, warning)


def provider_order(report: HardwareReport) -> list[str]:
    return (["CUDAExecutionProvider", "CPUExecutionProvider"] if report.cuda_active
            else ["CPUExecutionProvider"])


def report_json(report: HardwareReport) -> str:
    return json.dumps(report.as_dict(), indent=2)

