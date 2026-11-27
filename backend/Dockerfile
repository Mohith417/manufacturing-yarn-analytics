# Pinned to the interpreter the models were trained with (Python 3.13.7) and the
# exact image tag verified with `docker pull`.
FROM python:3.13.7-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/models ./models
COPY backend/db ./db

EXPOSE 8000

# The app is a normal uvicorn service, not a Workers runtime: the hosted static
# site does not include it, by design.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
