$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path ".venv\Scripts\actionshots-qa.exe")) { throw "Run scripts\setup_windows.ps1 first." }
& .\.venv\Scripts\actionshots-qa.exe serve --root (Get-Location)

