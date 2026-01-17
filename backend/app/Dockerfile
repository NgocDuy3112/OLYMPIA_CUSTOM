FROM python:3.12-alpine

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN uv python pin 3.12

ADD . /app

WORKDIR /app

# Ensure the project root is on Python's import path
ENV PYTHONPATH="/app"

# Ensure the virtualenv created by uv is on PATH
ENV PATH="/app/.venv/bin:$PATH"

RUN uv add -r requirements.txt

EXPOSE 8000

CMD ["fastapi", "run", "main.py", "--host", "0.0.0.0", "--port", "8000"]