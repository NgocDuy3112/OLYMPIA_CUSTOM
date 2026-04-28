## Multi-stage build — lightweight image, no Discord/audio dependencies
FROM python:3.12-alpine AS builder

RUN apk add --no-cache build-base libffi-dev openssl-dev

WORKDIR /wheels

COPY backend/qualifier-bot/requirements.txt ./
RUN pip wheel --no-cache-dir --wheel-dir=/wheels -r requirements.txt


FROM python:3.12-alpine

WORKDIR /app

COPY --from=builder /wheels /wheels
COPY backend/qualifier-bot/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt

COPY backend/qualifier-bot/ /app

RUN addgroup -S app && adduser -S app -G app
USER app

CMD ["python", "qualifier_bot.py"]
