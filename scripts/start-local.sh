#!/usr/bin/env bash

# ==============================================================================
# Local Intelligence Workspace Launcher
# ==============================================================================
# Starts all platform services locally and redirects application & container
# logs to timestamped log files under logs/run_<timestamp>/
#
# Pressing Ctrl+C (SIGINT/SIGTERM) automatically terminates all sub-processes 
# and brings down the Docker Compose containers.
# ==============================================================================

set -e

# Color output tokens
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Determine repository root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

# Create invocation-specific log directory
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_DIR="${ROOT_DIR}/logs/run_${TIMESTAMP}"
mkdir -p "${LOG_DIR}"
DOCKER_DIR="${LOG_DIR}/docker"
mkdir -p "${DOCKER_DIR}"

# Create/update logs/latest symlink
rm -f "${ROOT_DIR}/logs/latest" 2>/dev/null || true
ln -s "${LOG_DIR}" "${ROOT_DIR}/logs/latest" 2>/dev/null || true

DOCKER_LOG="${DOCKER_DIR}/docker.log"
DB_LOG="${DOCKER_DIR}/db.log"
LOCALSTACK_LOG="${DOCKER_DIR}/localstack.log"
OLLAMA_LOG="${DOCKER_DIR}/ollama.log"
PRISMA_LOG="${LOG_DIR}/prisma.log"
API_LOG="${LOG_DIR}/api.log"
WORKER_LOG="${LOG_DIR}/worker.log"
FRONTEND_LOG="${LOG_DIR}/frontend.log"

echo -e "${CYAN}======================================================================${NC}"
echo -e "${CYAN}        AI Document Intelligence Platform — Local Launcher           ${NC}"
echo -e "${CYAN}======================================================================${NC}"
echo -e "${YELLOW}Active Run Logs Directory: ${LOG_DIR}${NC}"
echo -e "${YELLOW}Latest Symlink           : logs/latest/${NC}"

# 1. Ensure .env file exists
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    echo -e "${YELLOW}[Notice] .env file not found. Copying from .env.example...${NC}"
    cp .env.example .env
  else
    echo -e "${RED}[Error] Neither .env nor .env.example file was found.${NC}"
    exit 1
  fi
fi

# Export environment variables for child processes
set -a
source .env
set +a

# Track child background process PIDs for clean teardown
PIDS=()

cleanup() {
  echo -e "\n${YELLOW}======================================================================${NC}"
  echo -e "${YELLOW}  Shutting down local applications and Docker containers...           ${NC}"
  echo -e "${YELLOW}======================================================================${NC}"
  
  # Terminate child application PIDs
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done

  # Terminate any sub-processes
  pkill -P $$ 2>/dev/null || true

  # Bring down Docker Compose infrastructure
  echo -e "${YELLOW}Bringing down Docker Compose modules (db, localstack, ollama)...${NC}"
  cd "${ROOT_DIR}"
  docker compose down >> "${DOCKER_LOG}" 2>&1 || true
  
  echo -e "${GREEN}✓ All applications and Docker containers shut down cleanly.${NC}"
  echo -e "${CYAN}Logs for this run saved at: ${LOG_DIR}${NC}"
  exit 0
}

# Capture SIGINT (Ctrl+C), SIGTERM, and EXIT signals
trap cleanup SIGINT SIGTERM EXIT

# 2. Start Docker Compose Infrastructure
echo -e "\n${CYAN}[1/5] Starting Docker infrastructure modules (PostgreSQL, LocalStack, Ollama)...${NC}"
docker compose up -d >> "${DOCKER_LOG}" 2>&1

# Stream container logs in background to log sinks
docker logs -f docintel-db >> "${DB_LOG}" 2>&1 &
PIDS+=($!)

docker logs -f docintel-localstack >> "${LOCALSTACK_LOG}" 2>&1 &
PIDS+=($!)

docker logs -f docintel-ollama >> "${OLLAMA_LOG}" 2>&1 &
PIDS+=($!)

echo -e "${YELLOW}Waiting for infrastructure containers to become healthy...${NC}"

# Function to wait for container health
wait_for_health() {
  local container_name=$1
  local max_attempts=40
  local attempt=1

  while [ $attempt -le $max_attempts ]; do
    status=$(docker inspect --format='{{json .State.Health.Status}}' "$container_name" 2>/dev/null || echo '"unhealthy"')
    
    if [ "$status" == '"healthy"' ]; then
      echo -e "${GREEN}  ✓ Container ${container_name} is healthy.${NC}"
      return 0
    fi

    # Fallback endpoint check for LocalStack
    if [ "$container_name" == "docintel-localstack" ]; then
      if curl -s http://localhost:${LOCALSTACK_PORT:-4566}/_localstack/health 2>/dev/null | grep -q '"s3": "running"'; then
        echo -e "${GREEN}  ✓ Container ${container_name} is operational.${NC}"
        return 0
      fi
    fi

    sleep 2
    attempt=$((attempt + 1))
  done

  echo -e "${RED}  ✗ Container ${container_name} failed to become healthy within timeout.${NC}"
  return 1
}

wait_for_health "docintel-db"
wait_for_health "docintel-localstack" || echo -e "${YELLOW}  ⚠ LocalStack is starting up (non-blocking for dev).${NC}"
wait_for_health "docintel-ollama"

# 3. Prepare API Database (Prisma Client & Migrations)
echo -e "\n${CYAN}[2/5] Syncing database schema with Prisma (apps/api)...${NC}"
cd "${ROOT_DIR}/apps/api"
npx prisma generate >> "${PRISMA_LOG}" 2>&1
npx prisma db push --skip-generate >> "${PRISMA_LOG}" 2>&1

# 4. Prepare Worker Virtual Environment
echo -e "\n${CYAN}[3/5] Checking Python worker virtual environment (apps/worker)...${NC}"
cd "${ROOT_DIR}/apps/worker"
if [ ! -d "venv" ]; then
  echo -e "${YELLOW}Creating Python virtual environment at apps/worker/venv...${NC}"
  python3 -m venv venv
  ./venv/bin/pip install --upgrade pip >> "${WORKER_LOG}" 2>&1
  ./venv/bin/pip install -r requirements.txt >> "${WORKER_LOG}" 2>&1
fi

# 5. Launch Application Services with dedicated log outputs
echo -e "\n${CYAN}[4/5] Launching applications with dedicated log sinks...${NC}"

# Launch Node.js API Service (Port 3000)
echo -e "${GREEN}  ➜ Starting API Service (http://localhost:3000)...${NC}"
echo -e "${CYAN}     Log file: ${API_LOG}${NC}"
cd "${ROOT_DIR}/apps/api"
npm run dev >> "${API_LOG}" 2>&1 &
PIDS+=($!)

# Wait for API service to bind port 3000
echo -e "${YELLOW}  Waiting for API service to bind port 3000...${NC}"
attempt=1
while [ $attempt -le 15 ]; do
  if curl -s http://localhost:3000/health >/dev/null 2>&1; then
    echo -e "${GREEN}  ✓ API Service is ready on port 3000.${NC}"
    break
  fi
  sleep 1
  attempt=$((attempt + 1))
done

# Launch Python Worker Daemon
echo -e "${GREEN}  ➜ Starting Python Ingestion Worker...${NC}"
echo -e "${CYAN}     Log file: ${WORKER_LOG}${NC}"
cd "${ROOT_DIR}/apps/worker"
./venv/bin/python main.py >> "${WORKER_LOG}" 2>&1 &
PIDS+=($!)

# Launch React Next.js Frontend (Port 3001)
echo -e "${GREEN}  ➜ Starting Frontend SPA (http://localhost:3001)...${NC}"
echo -e "${CYAN}     Log file: ${FRONTEND_LOG}${NC}"
cd "${ROOT_DIR}/apps/frontend"
PORT=3001 npm run dev:local >> "${FRONTEND_LOG}" 2>&1 &
PIDS+=($!)

echo -e "\n${CYAN}[5/5] All applications launched successfully!${NC}"
echo -e "${CYAN}======================================================================${NC}"
echo -e "${GREEN}  • Frontend Workspace : http://localhost:3001${NC}"
echo -e "${GREEN}  • API Console        : http://localhost:3000${NC}"
echo -e "${GREEN}  • Swagger API Docs   : http://localhost:3000/api-docs${NC}"
echo -e "${CYAN}======================================================================${NC}"
echo -e "${YELLOW}Logs for this session:${NC}"
echo -e "  - LocalStack Init : logs/latest/localstack.log (tail -f logs/latest/localstack.log)"
echo -e "  - Ollama Model Init: logs/latest/ollama.log     (tail -f logs/latest/ollama.log)"
echo -e "  - PostgreSQL DB    : logs/latest/db.log"
echo -e "  - Express API      : logs/latest/api.log        (tail -f logs/latest/api.log)"
echo -e "  - Python Worker    : logs/latest/worker.log     (tail -f logs/latest/worker.log)"
echo -e "  - Next.js Frontend : logs/latest/frontend.log"
echo -e "${CYAN}======================================================================${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all applications and Docker containers.${NC}\n"

# Wait for background processes
wait
