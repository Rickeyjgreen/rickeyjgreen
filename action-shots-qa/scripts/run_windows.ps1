$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path ".venv\Scripts\actionshots-qa.exe")) { throw "Run scripts\setup_windows.ps1 first." }
$required = @(
  "models\face_detection_yunet_2023mar.onnx",
  "models\face_recognition_sface_2021dec.onnx",
  "models\facial_expression_recognition_mobilefacenet_2022july.onnx",
  "models\exiftool.exe"
)
$missing = @($required | Where-Object { -not (Test-Path $_) })
if ($missing.Count -gt 0) {
  throw "Setup is incomplete. Missing: $($missing -join ', '). Run scripts\setup_windows.ps1 again."
}
& .\.venv\Scripts\actionshots-qa.exe diagnose --root (Get-Location)
if ($LASTEXITCODE -ne 0) { throw "GPU/model startup check failed; server was not started." }
& .\.venv\Scripts\actionshots-qa.exe serve --root (Get-Location)
