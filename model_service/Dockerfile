# VoxClone model service — Kokoro (presets/mixing) + Pocket TTS (cloning).
# CPU-only. Built and run as a container on Azure Container Apps.
FROM python:3.11-slim

# System deps: espeak-ng is Kokoro's phonemizer fallback; libsndfile backs soundfile I/O.
RUN apt-get update \
    && apt-get install -y --no-install-recommends espeak-ng libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install the CPU-only build of torch first. The default PyPI build bundles CUDA
# libraries (~2GB) this service never uses — installing from the CPU index keeps
# the image small, so builds and cold starts stay fast (and cheaper on Azure).
RUN pip install --no-cache-dir "torch>=2.5.0" --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Azure Container Apps sends ingress traffic to this port (set via --target-port 8000).
EXPOSE 8000

# Models load at import time (see main.py), so the FIRST boot downloads weights and
# is slow (~1-2 min); after that requests are fast. Listens on $PORT if Azure sets it.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
