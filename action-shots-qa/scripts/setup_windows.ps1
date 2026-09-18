$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
  throw "Python launcher not found. Install Python 3.11 x64 from python.org, then rerun."
}
py -3.11 -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -e ".[dev]"

New-Item -ItemType Directory -Force -Path models | Out-Null

function Get-VerifiedFile {
  param(
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][string[]]$Urls,
    [Parameter(Mandatory=$true)][string]$Sha256
  )
  if (Test-Path $Path) {
    $existingHash = (Get-FileHash -Algorithm SHA256 $Path).Hash.ToLowerInvariant()
    if ($existingHash -eq $Sha256) {
      Write-Host "$Label already verified." -ForegroundColor DarkGreen
      return
    }
    Remove-Item $Path -Force
  }
  $partial = "$Path.download"
  Remove-Item $partial -Force -ErrorAction SilentlyContinue
  foreach ($url in $Urls) {
    try {
      Write-Host "Downloading $Label..." -ForegroundColor Cyan
      if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        & curl.exe --fail --location --silent --show-error --retry 2 `
          --connect-timeout 20 --max-time 300 --output $partial $url
        if ($LASTEXITCODE -ne 0) { throw "curl.exe exited with code $LASTEXITCODE" }
      } else {
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $partial -MaximumRedirection 10
      }
      $actualHash = (Get-FileHash -Algorithm SHA256 $partial).Hash.ToLowerInvariant()
      if ($actualHash -ne $Sha256) {
        throw "$Label checksum mismatch. Expected $Sha256; received $actualHash"
      }
      Move-Item $partial $Path -Force
      Write-Host "$Label verified." -ForegroundColor Green
      return
    } catch {
      Write-Warning "$Label download failed from $url : $($_.Exception.Message)"
      Remove-Item $partial -Force -ErrorAction SilentlyContinue
    }
  }
  throw "Could not download a verified copy of $Label."
}

Get-VerifiedFile -Label "YuNet face detector" `
  -Path "models\face_detection_yunet_2023mar.onnx" `
  -Urls @(
    "https://huggingface.co/opencv/opencv_zoo/resolve/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx?download=true",
    "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
  ) `
  -Sha256 "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"

Get-VerifiedFile -Label "SFace identity model" `
  -Path "models\face_recognition_sface_2021dec.onnx" `
  -Urls @(
    "https://huggingface.co/opencv/opencv_zoo/resolve/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx?download=true",
    "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"
  ) `
  -Sha256 "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79"

Get-VerifiedFile -Label "ExifTool 13.59" `
  -Path "models\exiftool.zip" `
  -Urls @(
    "https://exiftool.org/exiftool-13.59_64.zip",
    "https://downloads.sourceforge.net/project/exiftool/exiftool-13.59_64.zip",
    "https://download.sourceforge.net/project/exiftool/exiftool-13.59_64.zip",
    "https://downloads.sourceforge.net/exiftool/exiftool-13.59_64.zip",
    "https://sourceforge.net/projects/exiftool/files/exiftool-13.59_64.zip/download"
  ) `
  -Sha256 "44b512b25af500724ba579d0a53c8fc5851628b692dd5e5d94ae4a15c2cba9ec"

if (-not (Test-Path "models\exiftool.exe")) {
  Remove-Item "models\exiftool-temp" -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive -Path "models\exiftool.zip" -DestinationPath "models\exiftool-temp" -Force
  $exe = Get-ChildItem "models\exiftool-temp" -Recurse -Filter "exiftool*.exe" | Select-Object -First 1
  if (-not $exe) { throw "ExifTool executable not found in downloaded archive" }
  Copy-Item $exe.FullName "models\exiftool.exe"
  $lib = Get-ChildItem "models\exiftool-temp" -Recurse -Directory -Filter "exiftool_files" | Select-Object -First 1
  if ($lib) { Copy-Item $lib.FullName "models\exiftool_files" -Recurse -Force }
}

Write-Host "Checking CUDA provider..." -ForegroundColor Cyan
& .\.venv\Scripts\actionshots-qa.exe diagnose --root (Get-Location)
if ($LASTEXITCODE -ne 0) { throw "GPU/model startup check failed." }
Write-Host "Setup complete. Run scripts\run_windows.ps1" -ForegroundColor Green
