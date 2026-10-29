<#
开发环境一键启动。

  - 前端：Vite dev server → http://127.0.0.1:5173（proxy 把 /api 与 /media 转给后端）
  - 后端：uvicorn --reload → http://127.0.0.1:8000

开发期前端走 Vite，后端不托管 frontend/dist（dist 不存在时 mount_frontend 自动跳过），
所以不需要先 build。

用法（在 backend 目录下）：
    powershell -ExecutionPolicy Bypass -File scripts\dev.ps1
    powershell -ExecutionPolicy Bypass -File scripts\dev.ps1 -BackendOnly

前置：backend\.venv 已建好并 pip install -r requirements.txt。
#>
param(
    [switch]$BackendOnly
)

$ErrorActionPreference = "Stop"

$backendDir = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path (Split-Path -Parent $backendDir) "frontend"
$activate = Join-Path $backendDir ".venv\Scripts\Activate.ps1"

if (-not (Test-Path $activate)) {
    throw "找不到 $activate，请先在 backend 目录执行：python -m venv .venv"
}

# 前端放新窗口，后端留在当前窗口，这样 uvicorn 的日志直接可见
if (-not $BackendOnly) {
    Write-Host "启动前端 dev server (http://127.0.0.1:5173) ..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList @(
        "-NoExit", "-Command", "Set-Location '$frontendDir'; npm run dev"
    )
}

Write-Host "启动后端 (http://127.0.0.1:8000) ..." -ForegroundColor Cyan
Set-Location $backendDir
& $activate
# 开发期开 --reload；它会打断正在跑的图片处理任务，靠启动补偿扫描捞回来，所以别用在生产
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000