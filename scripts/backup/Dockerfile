# Daily pg_dump → s3://aoc/backups/ — the stack's only off-box copy.
# Same postgres major as the server, so pg_dump speaks this schema's dialect,
# and the timezone is pinned so `date` stamps files in Vietnam time.
FROM postgres:18-trixie

RUN set -eux; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        awscli cron ca-certificates tzdata; \
    rm -rf /var/lib/apt/lists/*; \
    ln -snf /usr/share/zoneinfo/Asia/Ho_Chi_Minh /etc/localtime; \
    echo "Asia/Ho_Chi_Minh" > /etc/timezone

# Belt and braces: `date` reads TZ, cron reads /etc/localtime — both Vietnam.
ENV TZ=Asia/Ho_Chi_Minh

COPY backup.sh /usr/local/bin/backup.sh
COPY aoc-backup.cron /etc/cron.d/aoc-backup
RUN chmod 0755 /usr/local/bin/backup.sh \
    && chmod 0644 /etc/cron.d/aoc-backup

# One best-effort dump at boot (so a fresh box is never a day behind), then
# cron -f takes pid 1 — which is also where the job's output lands.
CMD ["bash", "-c", "/usr/local/bin/backup.sh || true; exec cron -f"]
