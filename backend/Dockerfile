FROM python:3.11-slim

WORKDIR /app

ENV DEJAVU_FONT_DIR=/usr/share/fonts/truetype/dejavu

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Windows CRLF → konteynerdə "no such file or directory" (shebang \r)
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh /app/scripts/celery_entrypoint.sh \
    && chmod +x /app/docker-entrypoint.sh /app/scripts/celery_entrypoint.sh

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
