FROM python:3-slim AS builder

# Set working directory
WORKDIR /app

# Install system dependencies required for wget and runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Download AWS RDS global CA bundle for SSL verification
RUN wget -qO /app/global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

FROM python:3-slim AS runner

ENV PYTHON_ENV=dev

# Create a non-root user for security3-slim
RUN groupadd -r appgroup && useradd -r -g appgroup -u 1001 appuser

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY app/ ./app/

# Remove unnecessary files
RUN rm -rf /app/scripts .env requirements-local.txt

COPY --from=builder /app/global-bundle.pem /app/global-bundle.pem
COPY main.py .

# Ensure the non-root user owns the app directory
RUN chown -R appuser:appgroup /app

# Switch to the non-root user
USER 1001

# Run the worker daemon
CMD ["python", "main.py"]
