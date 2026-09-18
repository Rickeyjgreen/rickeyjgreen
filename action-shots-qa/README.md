# Action Shots Photo QA — Calibrated v2

Local Windows application for a tagged GotPhoto shoot. It scans the entire shoot, keeps identity matching inside each Copyright/Barcode code, proposes one 5-star portrait per distinct person, proposes confident buddy/group images as 3-star, routes uncertainty to a fast local review screen, and writes ratings only after verification.

## Safety contract

- Photos, roster data, embeddings, proxies, and SQLite state stay on the workstation.
- Only barcode/code values are read from the GotPhoto export; names and parent contacts are not stored.
- CUDA failure is visible and blocks analysis unless the operator explicitly enables CPU fallback.
- Ratings are written with ExifTool to XMP Rating and Microsoft RatingPercent.
- Every JPEG is backed up by ExifTool before mutation, then Copyright and compressed JPEG scan bytes are verified. Failed verification restores the backup.
- The job database uses SQLite WAL and persists after every image and every human decision.

## Windows quick start

Requirements: Windows 11, Python 3.11 x64, NVIDIA driver, CUDA 12.x, cuDNN 9.x, and the Visual C++ 2019+ runtime. ONNX Runtime's official CUDA package requires CUDA and cuDNN on Windows; their `bin` folders must be on `PATH`.

```powershell
git clone https://github.com/Rickeyjgreen/rickeyjgreen.git
cd rickeyjgreen
git switch action-shots-photo-qa-mvp
cd action-shots-qa
PowerShell -ExecutionPolicy Bypass -File .\scripts\setup_windows.ps1
PowerShell -ExecutionPolicy Bypass -File .\scripts\run_windows.ps1
```

The app opens at `http://127.0.0.1:8765`. Paste the shoot folder and matching GotPhoto CSV/XLSX paths, then click **Analyze shoot**.

For an existing checkout, stop the server and update it before rerunning setup:

```powershell
cd C:\Windows\System32\rickeyjgreen
git switch action-shots-photo-qa-mvp
git pull
cd action-shots-qa
PowerShell -ExecutionPolicy Bypass -File .\scripts\setup_windows.ps1
PowerShell -ExecutionPolicy Bypass -File .\scripts\run_windows.ps1
```

If setup ever reports a failed download, do not launch the server. Pull the latest branch and rerun `setup_windows.ps1`; the installer verifies SHA-256 checksums and the run script now blocks incomplete installations.

## Operator flow

1. Diagnose confirms the NVIDIA GPU, dedicated VRAM, `CUDAExecutionProvider`, and CPU fallback availability.
2. Analysis builds 1024px proxies, detects faces, creates GPU SFace embeddings, and uses a local neural expression model plus sharpness, pose, exposure, and framing to rank portraits.
3. Every confident image containing two or more faces is proposed as a 3-star buddy/group image. A person seen only in buddy images does not create a fake missing-portrait task.
4. Review only real exceptions. Click or press `1`–`4` to highlight; `Enter` saves the 5-star winner; `G` marks the selected image 3-star; arrows navigate without jumping back to the start.
5. Use **Inspect selections** for a fast visual safety pass. **Verify & write ratings** stays blocked until all required exceptions are resolved.
6. A pre-write report is saved as `analysis-report.json`. After verified metadata writes, `final-report.json` is saved in the same job folder.

## Resume

Restart `run_windows.ps1`, open the existing job, and use the resume endpoint/UI. Images already marked `DONE` are skipped. Review decisions are committed immediately.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Tests cover GotPhoto code loading/privacy, durable resume state, group-only identity handling, close-score selection, stable review ordering, pre-write reporting, explicit CPU fallback, and JPEG scan integrity. The real-workstation acceptance test must additionally run a tagged fixture through ExifTool and confirm Copyright/rating preservation before the first production write.

## Current honest limits

- YuNet face detection uses OpenCV's dependable detector wrapper on CPU; SFace embedding inference uses ONNX Runtime CUDA. No Intel iGPU provider is selected.
- Expression ranking now uses OpenCV Zoo's local MobileFaceNet expression model. It improves smile/neutral selection but is not a reliable blink detector, so **Inspect selections** remains the final safety pass.
- A person not detected by YuNet cannot be auto-clustered and is routed to review.
- Thresholds were calibrated against the Colts database failure pattern: the old run would drop from 132 open items to seven quality reviews before applying the new expression signal.

Model licenses: OpenCV Zoo YuNet is MIT. The facial-expression model is Apache 2.0. SFace is distributed by OpenCV Zoo with its accompanying license. Setup downloads pinned, SHA-256-verified model files rather than committing binaries.
