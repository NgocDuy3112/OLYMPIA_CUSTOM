#!/bin/sh
# livekit-server's startup — compose mounts this instead of an inline heredoc.
# POSIX sh on purpose: the stock server image ships no bash, and this is the
# same config the inline block always wrote (verbatim move).
set -eu

cat > /tmp/livekit.yaml <<EOF
port: 7880
keys:
  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}
redis:
  address: redis:6379
rtc:
  node_ip: 127.0.0.1
  udp_port: 7882
  tcp_port: 7881
EOF

exec /livekit-server --config /tmp/livekit.yaml
