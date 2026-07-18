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

COPY omr-service/scripts/patch_omrchecker_headless.py /tmp/patch_omrchecker_headless.py
RUN python /tmp/patch_omrchecker_headless.py

ENV OMRCHECKER_ROOT=/opt/OMRChecker

# Backend: get_omr_template — PDF / dizayner ilə eyni fieldBlocks (şaquli DİM, timing zolağı, origin TL)
COPY backend /opt/imtahan
ENV PYTHONPATH=/opt/imtahan

COPY omr-service/requirements.txt /tmp/omr-req.txt
COPY omr-service/requirements-backend-bridge.txt /tmp/bridge-req.txt
RUN pip install --no-cache-dir -r /tmp/omr-req.txt -r /tmp/bridge-req.txt

COPY omr-service /app/
RUN sed -i 's/\r$//' /app/scripts/uvicorn_entrypoint.sh && chmod +x /app/scripts/uvicorn_entrypoint.sh

CMD ["/app/scripts/uvicorn_entrypoint.sh"]
