FROM python:3.12-slim

# libgomp is needed by LightGBM
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face runs Docker Spaces as user 1000
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /home/user/app

COPY --chown=user requirements.txt requirements.txt
# CPU-only PyTorch wheel (much smaller than the default CUDA build)
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

COPY --chown=user . .

ENV DATA_BACKEND=duckdb \
    GOLD_PARQUET_DIR=/home/user/app/data/gold_parquet \
    APP_ENV=production \
    TRUST_PROXY=1 \
    PORT=7860

EXPOSE 7860
CMD ["sh", "entrypoint.sh"]
