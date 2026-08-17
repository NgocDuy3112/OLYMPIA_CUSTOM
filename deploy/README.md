# Deploy OLYMPIA CUSTOM to Production

Step-by-step guide to deploy the quiz game on a VPS using **Podman** only.
The host needs **no other software** — Nginx, Certbot, PostgreSQL, Valkey,
and the app all run as containers.

---

## Prerequisites

- VPS with **Ubuntu 22.04+** / **Debian 12+** / **AlmaLinux 9+**
- Domain name pointing to VPS public IP (e.g. `olympia.yourdomain.com`)
- SSH access as root or sudo user

---

## 1. Install Podman

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install -y podman
pip3 install podman-compose
```

### AlmaLinux / Rocky / Fedora

```bash
sudo dnf install -y podman podman-compose
```

Verify:

```bash
podman --version
podman-compose --version
```

---

## 2. Clone the Repository

```bash
sudo mkdir -p /opt/olympia
sudo chown $USER:$USER /opt/olympia
cd /opt/olympia
git clone <your-repo-url> .
```

---

## 3. Configure Environment

```bash
cp configs/.env.example configs/.env
nano configs/.env
```

Required variables:

```env
# Fastify API
APP_HOST=0.0.0.0
APP_PORT=8000
NODE_ENV=production
FRONTEND_URL=https://olympia.yourdomain.com

# PostgreSQL
POSTGRES_DB_USER=olympia
POSTGRES_DB_PASSWORD=<strong-password>
POSTGRES_DB_HOST=postgresql
POSTGRES_DB_PORT=5432
POSTGRES_DB_NAME=olympia_custom

# Valkey
VALKEY_USER=default
VALKEY_PASSWORD=<strong-password>
VALKEY_HOST=valkey
VALKEY_PORT=6379

# Google OAuth
GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-client-secret>
GOOGLE_CALLBACK_URL=https://olympia.yourdomain.com/api/auth/google/callback

# Deployment (used by docker-compose-dev.yaml)
DOMAIN=olympia.yourdomain.com
CERTBOT_EMAIL=admin@yourdomain.com
```

Google OAuth uses environment variables; no credentials file upload needed.

---

## 4. Build Frontend

On your **local machine**:

```bash
cd frontend
npm install

# Production build — replace with your actual domain
VITE_API_BASE_URL=https://olympia.yourdomain.com \
VITE_WS_BASE_URL=wss://olympia.yourdomain.com \
npm run build
```

Copy the build output to the VPS:

```bash
scp -r apps/web/dist/ user@vps:/opt/olympia/apps/web/dist/
```

---

## 5. Start Everything

```bash
cd /opt/olympia
podman compose -f docker-compose-dev.yaml up -d --build
```

This starts **5 development services**:

| Container | Purpose |
|-----------|---------|
| `olympia-postgresql` | Database |
| `olympia-valkey` | Cache + WebSocket pub/sub |
| `oc-app` | Fastify TypeScript API |
| `olympia-nginx` | Reverse proxy + static files |
| `olympia-certbot` | Let's Encrypt TLS certificates |

Verify:

```bash
podman ps
# All 5 containers should be "Up"
```

Check logs:

```bash
podman compose -f docker-compose-dev.yaml logs -f app
podman compose -f docker-compose-dev.yaml logs -f frontend
```

---

## 6. Firewall

```bash
# Ubuntu (UFW)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable

# AlmaLinux (firewalld)
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --reload
```

**Do NOT** open port 8000, 5432, or 6379 — all traffic goes through Nginx.

---

## 7. Enable systemd Auto-Start

```bash
sudo cp deploy/olympia.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable olympia
sudo systemctl start olympia
sudo systemctl status olympia
```

Now the app will:
- Start automatically on VPS boot
- Restart if any container crashes

---

## Certificate Renewal

Certbot container requests a certificate on first start.
To renew before expiry (Let's Encrypt certs last 90 days):

```bash
podman compose -f docker-compose-dev.yaml exec certbot \
  certbot renew --webroot --webroot-path=/var/www/certbot

# Then reload Nginx to pick up the new cert
podman compose -f docker-compose-dev.yaml exec nginx nginx -s reload
```

---

## Maintenance

### View logs

```bash
podman compose -f docker-compose-dev.yaml logs -f app
journalctl -u olympia -f
```

### Update code

```bash
cd /opt/olympia
git pull

# Rebuild frontend with production URLs
cd frontend
VITE_API_BASE_URL=https://olympia.yourdomain.com \
VITE_WS_BASE_URL=wss://olympia.yourdomain.com \
npm run build
cd ..
scp -r apps/web/dist/ user@vps:/opt/olympia/apps/web/dist/

# Rebuild and restart containers
podman compose -f docker-compose-dev.yaml up -d --build
```

### Backup database

```bash
podman exec olympia-postgresql pg_dump -U olympia olympia_custom > backup_$(date +%F).sql
```

### Restore database

```bash
cat backup_2026-03-31.sql | podman exec -i olympia-postgresql psql -U olympia olympia_custom
```
