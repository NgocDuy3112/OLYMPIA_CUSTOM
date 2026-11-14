set -euo pipefail

: "${S3_ACCESS_KEY_ID:?set S3_ACCESS_KEY_ID in configs/.env}"
: "${S3_SECRET_ACCESS_KEY:?set S3_SECRET_ACCESS_KEY in configs/.env}"
: "${S3_ENDPOINT:?set S3_ENDPOINT in configs/.env}"
: "${S3_BUCKET:?set S3_BUCKET in configs/.env}"

cat > /tmp/egress.yaml <<EOF
logging:
  level: info
api_key: ${LIVEKIT_API_KEY}
api_secret: ${LIVEKIT_API_SECRET}
ws_url: ws://livekit:7880
insecure: true
redis:
  address: redis:6379
session_limits:
  file_output_max_duration: 4h
storage:
  s3:
    access_key: ${S3_ACCESS_KEY_ID}
    secret: ${S3_SECRET_ACCESS_KEY}
    region: ${S3_REGION}
    endpoint: ${S3_ENDPOINT}
    bucket: ${S3_BUCKET}
EOF

rm -rf /home/egress/tmp/* || true
ulimit -n 65536 || true
rm -rf /var/run/pulse /var/lib/pulse /home/egress/.config/pulse /home/egress/.cache/xdgr/pulse || true
pulseaudio -D --verbose --exit-idle-time=-1 --disallow-exit >/dev/null 2>&1 || true

export EGRESS_CONFIG_FILE=/tmp/egress.yaml
exec egress
