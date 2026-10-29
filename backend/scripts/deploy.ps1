<#
生产部署（Windows）：构建前端 → 用一个 uvicorn 进程同时提供 API 与前端页面。

部署步骤（首次）：
    1. mysql -uroot -p < scripts\init_db.sql          建库 + 建 ms_app 用户
    2. Copy-Item .env.example .env                    然后填 DATABASE_URL / SECRET_KEY
       SECRET_KEY 生成：python -c "import secrets;print(secrets.token_urlsafe(48))"
    3. python -m venv .venv; .\.venv\Scripts\Activate.ps1
       pip install -r requirements.txt
       用 S3 存储再加装：pip install boto3
       （必须装 cryptography，PyMySQL 连 MySQL 8 的 caching_sha2_password 依赖它）
    4. alembic upgrade head
    5. 需要对象存储时：仓库根目录 docker compose up -d

日常更新：
    powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1

用法：
    powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
    powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -BindHost 0.0.0.0 -Port 8080
    powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -SkipFrontendBuild

两个刻意的取舍：
  - 不开 --workers：Windows 上多进程会各起一份 ThreadPoolExecutor，启动补偿扫描也会重复跑，
    结果是同一张图被处理多次。
  - 不开 --reload：会打断正在进行的图片处理任务。
前端 dist 由后端托管（app.main.mount_frontend），所以对外只需暴露这一个端口。
#>
param(
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 8000,
    [switch]$SkipFrontendBuild
)

$ErrorActionPreference = "Stop"

$backendDir = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path (Split-Path -Parent $backendDir) "frontend"
$activate = Join-Path $backendDir ".venv\Scripts\Activate.ps1"

if (-not (Test-Path $activate)) {
    throw "找不到 $activate，请先按本文件头部说明建好虚拟环境。"
}

# 1) 构建前端 → frontend/dist，后端启动时自动托管（含 SPA 回退）
if (-not $SkipFrontendBuild) {
    Write-Host "[1/2] 构建前端 ..." -ForegroundColor Cyan
    Push-Location $frontendDir
    try {
        if (-not (Test-Path "node_modules")) {
            npm install
        }
        npm run build
    } finally {
        Pop-Location
    }
    if (-not (Test-Path (Join-Path $frontendDir "dist\index.html"))) {
        throw "前端构建产物缺失，构建似乎没有成功。"
    }
} else {
    Write-Host "[1/2] 跳过前端构建" -ForegroundColor Yellow
}

# 2) 起后端
Write-Host "[2/2] 启动服务 http://${BindHost}:${Port}" -ForegroundColor Cyan
Set-Location $backendDir
& $activate
uvicorn app.main:app --host $BindHost --port $Port