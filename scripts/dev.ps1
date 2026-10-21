# Runs the backend (uvicorn --reload on :8000) and the frontend (Vite on :5173) in two windows.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path "$root\frontend\node_modules")) {
    Push-Location "$root\frontend"; npm install; Pop-Location
}
Push-Location "$root\backend"; uv sync; Pop-Location

Start-Process powershell -WorkingDirectory "$root\backend" -ArgumentList '-NoExit', '-Command', 'uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000'
Start-Process powershell -WorkingDirectory "$root\frontend" -ArgumentList '-NoExit', '-Command', 'npm run dev'
Write-Host "Frontend: http://localhost:5173  (backend API on :8000). Close the two windows to stop."
