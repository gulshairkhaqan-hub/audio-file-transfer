FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# The deploy platform (e.g. Hugging Face) injects the PORT env variable dynamically
EXPOSE 7860

CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-7860}
