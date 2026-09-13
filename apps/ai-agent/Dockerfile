FROM python:3.12-slim

WORKDIR /app

COPY apps/ai-agent/pyproject.toml ./
RUN pip install --no-cache-dir . && pip install --no-cache-dir uvicorn[standard]

COPY apps/ai-agent/app ./app

ENV PYTHONUNBUFFERED=1
EXPOSE 8100

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
