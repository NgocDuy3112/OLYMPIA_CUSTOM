#!/bin/sh
set -e

CERT_FILE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"

if [ -f "$CERT_FILE" ]; then
    # Cert exists — start directly with HTTPS
    envsubst '$DOMAIN' < /etc/nginx/https.conf.template > /etc/nginx/conf.d/default.conf
else
    # No cert yet — start HTTP-only so certbot can complete ACME challenge
    cp /etc/nginx/init.conf /etc/nginx/conf.d/default.conf
    # Background watcher: switch to HTTPS once cert appears
    (
        while [ ! -f "$CERT_FILE" ]; do
            sleep 5
        done
        envsubst '$DOMAIN' < /etc/nginx/https.conf.template > /etc/nginx/conf.d/default.conf
        nginx -s reload
    ) &
fi

exec nginx -g 'daemon off;'
