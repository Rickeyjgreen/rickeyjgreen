import pytest

from actionshots_qa import hardware


def test_cuda_failure_is_not_silent(monkeypatch):
    class FakeOrt:
        @staticmethod
        def get_available_providers(): return ["CPUExecutionProvider"]
    monkeypatch.setitem(__import__("sys").modules, "onnxruntime", FakeOrt)
    monkeypatch.setattr(hardware, "_nvidia_smi", lambda: (None, None, "missing"))
    with pytest.raises(hardware.HardwareError, match="CUDA is not active"):
        hardware.diagnose(require_cuda=True, allow_cpu_fallback=False)


def test_explicit_cpu_fallback(monkeypatch):
    class FakeOrt:
        @staticmethod
        def get_available_providers(): return ["CPUExecutionProvider"]
    monkeypatch.setitem(__import__("sys").modules, "onnxruntime", FakeOrt)
    monkeypatch.setattr(hardware, "_nvidia_smi", lambda: (None, None, "missing"))
    report = hardware.diagnose(require_cuda=True, allow_cpu_fallback=True)
    assert report.requested_provider == "CPUExecutionProvider"

