$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
  throw "Python launcher not found. Install Python 3.11 x64 from python.org, then rerun."
}
py -3.11 -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -e ".[dev]"

New-Item -ItemType Directory -Force -Path models | Out-Null
$downloads = @{
  "models\face_detection_yunet_2023mar.onnx" = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
  "models\face_recognition_sface_2021dec.onnx" = "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"
  "models\exiftool.zip" = "https://exiftool.org/exiftool-13.59_64.zip"
}
foreach ($item in $downloads.GetEnumerator()) {
  if (-not (Test-Path $item.Key)) { Invoke-WebRequest -Uri $item.Value -OutFile $item.Key }
}
if (-not (Test-Path "models\exiftool.exe")) {
  Expand-Archive -Path "models\exiftool.zip" -DestinationPath "models\exiftool-temp" -Force
  $exe = Get-ChildItem "models\exiftool-temp" -Recurse -Filter "exiftool*.exe" | Select-Object -First 1
  if (-not $exe) { throw "ExifTool executable not found in downloaded archive" }
  Copy-Item $exe.FullName "models\exiftool.exe"
  $lib = Get-ChildItem "models\exiftool-temp" -Recurse -Directory -Filter "exiftool_files" | Select-Object -First 1
  if ($lib) { Copy-Item $lib.FullName "models\exiftool_files" -Recurse -Force }
}

Write-Host "Checking CUDA provider..." -ForegroundColor Cyan
& .\.venv\Scripts\actionshots-qa.exe diagnose
Write-Host "Setup complete. Run scripts\run_windows.ps1" -ForegroundColor Green
