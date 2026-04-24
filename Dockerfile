FROM python:3.9-slim

WORKDIR /app

# Set environment variables for Python
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Install system dependencies for psycopg2 and other native modules
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Copy all project directories
COPY backend/ ./backend/
COPY models/ ./models/
COPY integrations/ ./integrations/

# Use the PORT environment variable provided by Google Cloud Run
ENV PORT=8080

CMD ["uvicorn", "backend.rmhealth_api:app", "--host", "0.0.0.0", "--port", "8080"]
