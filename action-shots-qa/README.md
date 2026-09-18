# Action Shots Photo QA — Slice 1

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

If setup ever reports a failed download, do not launch the server. Pull the latest branch and rerun `setup_windows.ps1`; the installer verifies SHA-256 checksums and the run script now blocks incomplete installations.

## Operator flow

1. Diagnose confirms the NVIDIA GPU, dedicated VRAM, `CUDAExecutionProvider`, and CPU fallback availability.
2. Analysis builds 1024px proxies, detects faces, creates GPU SFace embeddings, calculates explainable quality features, and persists each image.
3. Review only exceptions. Click or press `1`–`4` to select; `Enter` chooses the 5-star winner; `G` marks a buddy/group image 3-star; arrows navigate.
4. **Verify & write ratings** stays blocked until all exceptions are resolved.
5. Final report is saved under `SHOOT\.actionshots-qa\JOB_ID\final-report.json`.

## Resume

Restart `run_windows.ps1`, open the existing job, and use the resume endpoint/UI. Images already marked `DONE` are skipped. Review decisions are committed immediately.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Tests cover GotPhoto code loading/privacy, durable resume state, unusual paths, explicit CPU fallback, and JPEG scan integrity. The real-workstation acceptance test must additionally run a tagged fixture through ExifTool and confirm Copyright/rating preservation before the first production write.

## Current honest limits

- YuNet face detection uses OpenCV's dependable detector wrapper on CPU; SFace embedding inference uses ONNX Runtime CUDA. No Intel iGPU provider is selected.
- Expression and eye signals are conservative landmark/geometry proxies in Slice 1. Close decisions go to review.
- A person not detected by YuNet cannot be auto-clustered and is routed to review.
- Initial score thresholds require calibration on the Colts test set before claiming the target automation rate or throughput.

Model licenses: OpenCV Zoo YuNet is MIT. SFace is distributed by OpenCV Zoo with its accompanying license; setup downloads the pinned model names rather than committing binaries.
