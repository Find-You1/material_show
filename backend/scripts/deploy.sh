#!/usr/bin/env bash
#
# 生产部署（Linux / 阿里云 ECS）：构建前端 → 用一个 uvicorn 进程同时提供 API 与前端页面。
# 是 scripts/deploy.ps1 的 Linux 版本，行为对齐。
#
# 为什么对外只开一个端口：
#   前端 dist 由后端托管（app.main.mount_frontend，含 SPA 回退，且 /api、/media 前缀
#   保持 JSON 404 不被回退吃掉），所以不装 Nginx 也能直接跑起来。后面加域名/HTTPS
#   时再把 Nginx 套在前面即可，后端不用改。
#
# ⚠️ 两个刻意的取舍（同 Windows 版结论）：
#   - 不开 --workers：多进程会各起一份 ThreadPoolExecutor，启动补偿扫描也会重复跑，
#     结果是同一张图被处理多次。
#   - 不开 --reload：会打断正在进行的图片处理任务。
#
# ---- 首次部署完整流程（阿里云 Alibaba Cloud Linux 3，仓库根目录）----
#   0. 装依赖（本脚本不碰包管理器，这几条得自己来）：
#        sudo dnf install -y python3.11 python3.11-pip mysql-server
#        sudo systemctl enable --now mysqld
#      Node 不用装：2 GiB 内存跑不动 vite 构建，改在本地 npm run build 后把 frontend/dist 传上来。
#   1. 建库建号：sudo mysql -u root -p < backend/scripts/init_db.sql
#      再放全文检索参数：sudo cp backend/scripts/mysql-ngram.cnf /etc/my.cnf.d/
#                        sudo systemctl restart mysqld
#      （不然中文关键词永远搜不到结果）
#   2. 配环境变量：cp backend/.env.production.example backend/.env && vim backend/.env
#   3. 一键装好：bash backend/scripts/deploy.sh --install-service
#      （建 venv、装依赖、跑迁移、构建前端、写 systemd 单元并开机自启）
#   4. 建管理员：SEED_ADMIN_PASSWORD='强密码' bash backend/scripts/deploy.sh --seed
#   5. 阿里云控制台安全组放行 TCP 8010（以及后面要用的 80/443）
#
# ---- 要套 Nginx（宝塔）时 ----
#   把 scripts/nginx-material-show.conf 合并进站点的 server {} 里，
#   然后把 uvicorn 的绑定地址改成 127.0.0.1，8010 就不用对公网开放了，
#   安全组里那条 8010 也可以删掉。
#
# ---- 日常更新 ----
#   bash backend/scripts/deploy.sh                   # 重新构建前端 + 重启服务
#   bash backend/scripts/deploy.sh --skip-frontend   # 只改了后端，跳过前端构建
#   bash backend/scripts/deploy.sh --migrate         # 有新迁移时
#
# 日志：journalctl -u material-show -f
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(dirname "$BACKEND_DIR")"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/.venv"
SERVICE_NAME="material-show"
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

BIND_HOST="0.0.0.0"
# 刻意不用 8000：阿里云这台机器上还有别的项目把 8000 占着（哪怕只绑 0.0.0.0），
# 撞上就是 uvicorn 起不来。8010 与它们错开。
PORT="8010"
INSTALL_SERVICE=0
SKIP_FRONTEND=0
DO_MIGRATE=0
DO_SEED=0
DO_RESTART=1

# --help 直接把文件头部的注释打出来：只读第一段连续注释，遇到第一条非注释行就停
usage() { awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "${BASH_SOURCE[0]}"; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --host)             BIND_HOST="$2"; shift 2 ;;
        --port)             PORT="$2"; shift 2 ;;
        --install-service)  INSTALL_SERVICE=1; DO_MIGRATE=1; shift ;;
        --skip-frontend)    SKIP_FRONTEND=1; shift ;;
        --migrate)          DO_MIGRATE=1; shift ;;
        --seed)             DO_SEED=1; shift ;;
        --no-restart)       DO_RESTART=0; shift ;;
        -h|--help)          usage; exit 0 ;;
        *) echo "未知参数：$1（用 --help 看用法）" >&2; exit 1 ;;
    esac
done

log() { printf '\033[36m%s\033[0m\n' "$*"; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

# sudo 只在非 root 时用，免得 root 环境下报 command not found
if [[ "$(id -u)" -eq 0 ]]; then SUDO=""; else SUDO="sudo"; fi

# ---- 0) 挑解释器 ----
# 不能直接用 python3：Alibaba Cloud Linux 3 / CentOS 自带的 python3 是 3.6，
# pydantic 2 与 SQLAlchemy 2 都要求 3.8+，装到一半就会失败。
PY_BIN=""
for cand in python3.12 python3.11 python3.10 python3; do
    if command -v "$cand" >/dev/null 2>&1 \
        && "$cand" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
        PY_BIN="$cand"; break
    fi
done
[[ -n "$PY_BIN" ]] || die "找不到 Python 3.10+。
  Alibaba Cloud Linux 3 / CentOS：sudo dnf install -y python3.11 python3.11-pip
  Ubuntu / Debian：               sudo apt install -y python3-venv python3-pip"
log "使用解释器 $(command -v "$PY_BIN")（$("$PY_BIN" -V 2>&1)）"

# ---- 1) 虚拟环境与依赖 ----
if [[ ! -x "$VENV_DIR/bin/python" ]]; then
    log "[1/5] 创建虚拟环境 $VENV_DIR"
    "$PY_BIN" -m venv "$VENV_DIR"
else
    log "[1/5] 复用已有虚拟环境 $VENV_DIR"
fi

log "[2/5] 安装/更新 Python 依赖"
"$VENV_DIR/bin/pip" install --upgrade pip --quiet
"$VENV_DIR/bin/pip" install -r "$BACKEND_DIR/requirements.txt" --quiet

# ---- 2) 数据库迁移 ----
if [[ "$DO_MIGRATE" -eq 1 ]]; then
    log "[3/5] 执行数据库迁移 alembic upgrade head"
    (cd "$BACKEND_DIR" && "$VENV_DIR/bin/alembic" upgrade head)
else
    log "[3/5] 跳过迁移（有新迁移时加 --migrate）"
fi

# ---- 3) 种子数据 ----
if [[ "$DO_SEED" -eq 1 ]]; then
    log "写入种子数据（分类 + 管理员）"
    (cd "$BACKEND_DIR" && "$VENV_DIR/bin/python" -m app.db.seed)
fi

# ---- 4) 构建前端 ----
if [[ "$SKIP_FRONTEND" -eq 0 ]]; then
    log "[4/5] 构建前端 → frontend/dist"
    if command -v npm >/dev/null 2>&1; then
        # 2 GiB 规格的机器（如 ecs.e-c1m1.large）上 rolldown/vite 构建很容易 OOM，
        # 冒内存告警但不阻断：真要用服务器构建，先加 2G swap：
        #   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile \
        #     && sudo mkswap /swapfile && sudo swapon /swapfile
        MEM_AVAIL_MB="$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 9999)"
        if [[ "$MEM_AVAIL_MB" -lt 1200 ]]; then
            log "  提示：可用内存仅 ${MEM_AVAIL_MB}MB，构建可能被 OOM 杀掉。"
            log "        更稳的做法是在本地 npm run build，把 frontend/dist 传上来后加 --skip-frontend。"
        fi
        (cd "$FRONTEND_DIR" && { [[ -d node_modules ]] || npm install; } && npm run build)
    elif [[ -f "$FRONTEND_DIR/dist/index.html" ]]; then
        # 小内存 ECS 上装 Node 不划算，允许在本地 build 完把 dist 传上来
        log "  本机没有 npm，沿用已有的 frontend/dist（改过前端就要在本地重新 build 后上传）"
    else
        die "本机没有 npm，也没有 frontend/dist。请装 Node 20+，或在本地 npm run build 后上传 dist"
    fi
    [[ -f "$FRONTEND_DIR/dist/index.html" ]] || die "构建产物缺失：$FRONTEND_DIR/dist/index.html"
else
    log "[4/5] 跳过前端构建"
fi

# ---- 5) systemd 单元 ----
if [[ "$INSTALL_SERVICE" -eq 1 ]]; then
    log "[5/5] 写入并启用 systemd 服务 $SERVICE_NAME"
    # 以当前登录用户运行，避免 root 跑出来的 storage 目录后续普通用户改不动
    RUN_USER="$(id -un)"
    $SUDO tee "$UNIT_PATH" >/dev/null <<EOF
[Unit]
Description=MaterialShow（FastAPI + 前端静态资源）
After=network.target mysql.service

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${BACKEND_DIR}
Environment=PYTHONUNBUFFERED=1
# 单进程。见 scripts/deploy.sh 头部注释：--workers 会让同一张图被重复处理。
ExecStart=${VENV_DIR}/bin/uvicorn app.main:app --host ${BIND_HOST} --port ${PORT}
Restart=always
RestartSec=3
# 日志走 journald：journalctl -u ${SERVICE_NAME} -f
# （不用 StandardOutput=append：那个要求日志文件对服务用户可写，容易踩权限坑）

[Install]
WantedBy=multi-user.target
EOF
    $SUDO systemctl daemon-reload
    $SUDO systemctl enable "$SERVICE_NAME"
else
    log "[5/5] 跳过 systemd 安装（首次部署请加 --install-service）"
fi

# ---- 本地存储目录 ----
# 本地存储只在首次写文件时才 mkdir，父目录若是 root 建的就会直接抛权限错误，
# 所以这里提前建好并交给服务用户。（用 s3 存图时这段不生效）
if [[ -f "$BACKEND_DIR/.env" ]]; then
    STORAGE_ROOT="$(grep -E '^LOCAL_STORAGE_ROOT=' "$BACKEND_DIR/.env" 2>/dev/null \
        | tail -n 1 | cut -d= -f2- | tr -d "\"'" | tr -d '[:space:]')"
    if [[ -n "$STORAGE_ROOT" && "$STORAGE_ROOT" == /* ]]; then
        $SUDO mkdir -p "$STORAGE_ROOT"
        # 目录可能落在 /data 这类 root 属主的位置，改归属交给服务用户
        $SUDO chown -R "$(id -un)" "$STORAGE_ROOT" 2>/dev/null || true
    fi
fi

# ---- 重启 ----
if [[ "$DO_RESTART" -eq 1 ]]; then
    if [[ -f "$UNIT_PATH" ]]; then
        # 启动失败也要把状态打出来，所以这里不让 set -e 提前退出
        $SUDO systemctl restart "$SERVICE_NAME" || log "服务启动失败，看下面的状态输出"
        sleep 1
        $SUDO systemctl --no-pager -l status "$SERVICE_NAME" | head -n 12 || true
        log "健康检查：curl -s http://127.0.0.1:${PORT}/health"
    else
        log "还没装 systemd 服务，先前台跑一遍看看："
        log "  cd $BACKEND_DIR && .venv/bin/uvicorn app.main:app --host $BIND_HOST --port $PORT"
    fi
fi