FROM python:3.11-slim

WORKDIR /app

# OMRChecker (Udayraj123/OMRChecker). Sabit versiya: build zamanı --build-arg OMRCHECKER_SHA=<commit>
ARG OMRCHECKER_SHA=
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && git clone https://github.com/Udayraj123/OMRChecker.git /opt/OMRChecker \
    && cd /opt/OMRChecker \
    && if [ -n "$OMRCHECKER_SHA" ]; then git fetch --depth 1 origin "$OMRCHECKER_SHA" && git checkout FETCH_HEAD; fi \
    && pip install --no-cache-dir -r /opt/OMRChecker/requirements.txt \
    && pip install --no-cache-dir "opencv-python-headless>=4.8"

ENV OMRCHECKER_ROOT=/opt/OMRChecker

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
