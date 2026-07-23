#!/bin/sh
set -eu

docker run --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v /var/lib/letsencrypt:/var/lib/letsencrypt \
  -v /opt/mock-interview-proxy/webroot:/var/www/certbot \
  certbot/certbot:v5.4.0 renew --quiet

docker kill --signal HUP mock-interview-proxy >/dev/null 2>&1 || true
