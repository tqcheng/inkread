FROM python:3.11-slim

# Install gcc for compiling dependencies
RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Expose port
EXPOSE 32206

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "32206"]