# SecureLens API image. Built by docker-compose.yml; see README "Run with Docker".
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Tesseract reads scanned PDF pages (OCR). English is included; add
# packages such as tesseract-ocr-fra and set OCR_LANGUAGES=eng+fra for more.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini .
COPY migrations ./migrations
COPY app ./app

# Run as an unprivileged user. Evidence files go to /app/uploads,
# which docker-compose.yml mounts as a named volume.
RUN useradd --uid 10001 --no-create-home --home-dir /app securelens \
    && mkdir -p /app/uploads \
    && chown securelens /app/uploads
USER securelens

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"]

# --proxy-headers makes the sign-in limit and activity log see the real
# client address that nginx forwards, not nginx's own address. The API
# port is not published by docker-compose.yml, so only nginx can reach it.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
