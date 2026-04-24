# syntax=docker/dockerfile:1
# check=skip=critical_high_vulnerabilities,CriticalHighVulnerabilities
# =============================================================================
# RMHEALTH MEDICAL SYSTEM - DOCKERFILE
# =============================================================================
# Production Medical API - FastAPI + ML Models + HIPAA Compliance
# Date: April 20, 2026

# =============================================================================
# STAGE 1: Builder - Dependencies and ML Models
# =============================================================================
FROM cgr.dev/chainguard/python:latest-dev AS builder

# Chainguard images run as non-root by default; use root only for package install.
USER root

# Container metadata
LABEL maintainer="Raul Morales - RMHealth Medical Systems"
LABEL version="1.0.0"
LABEL description="RMHealth Medical API - HIPAA Compliant Healthcare System"

# Environment variables for optimization
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    POETRY_NO_INTERACTION=1 \
    POETRY_VENV_IN_PROJECT=1 \
    POETRY_CACHE_DIR=/tmp/poetry_cache

# Install system dependencies for medical/ML libraries
RUN apk add --no-cache \
    build-base \
    curl \
    git \
    postgresql-dev \
    pkgconf \
    hdf5-dev \
    openblas-dev \
    gfortran \
    libjpeg-turbo-dev \
    libpng-dev

# Create working directory
WORKDIR /app

# Create isolated Python environment for reliable cross-stage copy
RUN python -m venv $VIRTUAL_ENV

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt && \
    pip install psycopg2-binary

# =============================================================================
# STAGE 2: Production Runtime
# =============================================================================
FROM cgr.dev/chainguard/python:latest AS production

ENV VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH

# Set working directory
WORKDIR /app

# Copy Python virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Copy application code
COPY api/ ./api/
COPY models/ ./models/
COPY scripts/ ./scripts/

# Copy ML models and medical data
COPY models/cardiac_lstm/ ./models/cardiac_lstm/
COPY models/*.joblib ./models/

# Chainguard runtime uses non-root by default (uid 65532)
USER 65532

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]

# Expose ports
EXPOSE 8000 8001

# Reset base image entrypoint to run CMD directly
ENTRYPOINT []

# Default command
CMD ["uvicorn", "api.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]

