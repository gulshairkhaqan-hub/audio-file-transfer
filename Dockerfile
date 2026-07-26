FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# Make the uploads folder writable (Hugging Face runs as non-root user)
RUN mkdir -p /app/uploads && chmod -R 777 /app/uploads

# Render provides the PORT env variable dynamically
EXPOSE 7860

CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-7860}
