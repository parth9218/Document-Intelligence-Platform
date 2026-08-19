#!/bin/sh
set -e

MODEL_NAME="${OLLAMA_MODEL:-llama3.2}"

# Start Ollama server in background
ollama serve &
SERVER_PID=$!

# Wait until Ollama API server is ready (using native ollama CLI)
until ollama list > /dev/null 2>&1; do
  sleep 1
done

echo "[Ollama Init] Ensuring model '${MODEL_NAME}' is available..."
ollama pull "${MODEL_NAME}"
echo "[Ollama Init] Model '${MODEL_NAME}' is ready!"

# Wait on background server process to keep container running
wait ${SERVER_PID}
