# Deployment Guide

Comprehensive guide for deploying OLYMPIA CUSTOM 3 to production environments.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Server Setup](#server-setup)
3. [Docker Deployment](#docker-deployment)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [VPS Deployment (Manual)](#vps-deployment-manual)
6. [SSL/TLS Configuration](#ssltls-configuration)
7. [Environment Variables](#environment-variables)
8. [Database Setup](#database-setup)
9. [Monitoring & Logging](#monitoring--logging)
10. [Backup & Recovery](#backup--recovery)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 2 cores | 4+ cores |
| **RAM** | 4 GB | 8+ GB |
| **Storage** | 20 GB | 50+ GB SSD |
| **Network** | 100 Mbps | 1 Gbps |

### Software Requirements

| Software | Version | Purpose |
|----------|---------|---------|
| **Docker** | 24+ | Containerization |
| **Docker Compose** | 2.20+ | Multi-container orchestration |
| **Nginx** | 1.24+ | Reverse proxy (if not using Docker) |
| **PostgreSQL** | 17 | Database (if not using Docker) |
| **Valkey** | 9 | Cache (if not using Docker) |
| **Node.js** | 18+ | Frontend build |
| **Python** | 3.12+ | Backend runtime |

---

## Server Setup

### Ubuntu/Debian Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Nginx
sudo apt install -y nginx

# Install Certbot for SSL
sudo apt install -y certbot python3-certbot-nginx

# Verify installations
docker --version
docker-compose --version
nginx -v
```

### CentOS/RHEL Setup

```bash
# Install Docker
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo yum install -y docker-ce docker-ce-cli containerd.io
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Nginx
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## Docker Deployment

### Production Docker Compose

**docker-compose.prod.yaml**:
```yaml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:17
    container_name: olympia-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_DB_USER}
      POSTGRES_PASSWORD: ${POSTGRES_DB_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups/postgres:/backups
    networks:
      - olympia-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Valkey Cache
  valkey:
    image: valkey/valkey:9
    container_name: olympia-valkey
    command: valkey-server --requirepass ${VALKEY_PASSWORD}
    volumes:
      - valkey_data:/data
    networks:
      - olympia-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "valkey-cli", "-a", "${VALKEY_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Backend API
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    container_name: olympia-backend
    env_file:
      - configs/.env.production
    environment:
      POSTGRES_DB_HOST: postgres
      VALKEY_HOST: valkey
    depends_on:
      postgres:
        condition: service_healthy
      valkey:
        condition: service_healthy
    networks:
      - olympia-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Frontend (Nginx serving static files)
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    container_name: olympia-frontend
    depends_on:
      - backend
    networks:
      - olympia-network
    restart: unless-stopped

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    container_name: olympia-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./logs/nginx:/var/log/nginx
    depends_on:
      - backend
      - frontend
    networks:
      - olympia-network
    restart: unless-stopped

volumes:
  postgres_data:
  valkey_data:

networks:
  olympia-network:
    driver: bridge
```

### Deployment Steps

**1. Prepare production environment**:
```bash
# Clone repository
git clone https://github.com/your-org/olympia-custom.git
cd olympia-custom

# Create production environment file
cp configs/.env.example configs/.env.production
nano configs/.env.production
```

**2. Configure environment variables**:
```bash
# See Environment Variables section below
```

**3. Build and start services**:
```bash
# Build all containers
docker-compose -f docker-compose.prod.yaml build

# Start all services
docker-compose -f docker-compose.prod.yaml up -d

# Check status
docker-compose -f docker-compose.prod.yaml ps

# View logs
docker-compose -f docker-compose.prod.yaml logs -f
```

**4. Run database migrations**:
```bash
docker-compose -f docker-compose.prod.yaml exec backend alembic upgrade head
```

**5. Verify deployment**:
```bash
# Health check
curl http://localhost/health

# Check API docs
curl http://localhost/docs
```

---

## Ngrok Preview for Development

If you want to expose the web app to the internet during development, use the shared-origin setup:

1. Start the local stack with the frontend service enabled.

```bash
podman-compose -f docker-compose.yaml -p olympia-custom --profile development --env-file ./configs/.env up -d app frontend bgm-bot sfx-bot
```

2. Start ngrok using the provided tunnel config.

```bash
ngrok config add-authtoken "$NGROK_AUTHTOKEN"
ngrok start web --config deploy/ngrok.yml
```

3. Open the forwarded ngrok URL shown in the terminal.

The frontend container listens on port `8080` and proxies `/api` and `/ws` to the backend `app` service, so one tunnel is enough.

If you prefer the local Vite dev server instead of the containerized frontend, run `npm run dev` inside `frontend/` and tunnel port `5173` with ngrok.

## Kubernetes Deployment

### Namespace and ConfigMap

**k8s/namespace.yaml**:
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: olympia-custom
```

**k8s/configmap.yaml**:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: olympia-config
  namespace: olympia-custom
data:
  POSTGRES_DB_HOST: "postgres-service"
  VALKEY_HOST: "valkey-service"
  LOG_LEVEL: "INFO"
  ALLOWED_ORIGINS: "https://your-domain.com"
```

**k8s/secret.yaml**:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: olympia-secrets
  namespace: olympia-custom
type: Opaque
stringData:
  SECRET_KEY: "your-secret-key-here"
  POSTGRES_DB_USER: "olympia_user"
  POSTGRES_DB_PASSWORD: "secure-password"
  POSTGRES_DB_NAME: "olympia_db"
  VALKEY_PASSWORD: "valkey-password"
  SMTP_USER: "your-smtp-user"
  SMTP_PASSWORD: "your-smtp-password"
```

### Deployments

**k8s/backend-deployment.yaml**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: olympia-custom
spec:
  replicas: 3
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: backend
        image: your-registry/olympia-backend:latest
        ports:
        - containerPort: 8000
        envFrom:
        - configMapRef:
            name: olympia-config
        - secretRef:
            name: olympia-secrets
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 30
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

**k8s/frontend-deployment.yaml**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: olympia-custom
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: your-registry/olympia-frontend:latest
        ports:
        - containerPort: 80
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
```

### Services

**k8s/services.yaml**:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend-service
  namespace: olympia-custom
spec:
  selector:
    app: backend
  ports:
  - port: 8000
    targetPort: 8000
  type: ClusterIP
---
apiVersion: v1
kind: Service
metadata:
  name: frontend-service
  namespace: olympia-custom
spec:
  selector:
    app: frontend
  ports:
  - port: 80
    targetPort: 80
  type: ClusterIP
```

### Ingress

**k8s/ingress.yaml**:
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: olympia-ingress
  namespace: olympia-custom
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - your-domain.com
    - api.your-domain.com
    secretName: olympia-tls
  rules:
  - host: your-domain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend-service
            port:
              number: 80
  - host: api.your-domain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: backend-service
            port:
              number: 8000
```

### Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Create secrets
kubectl apply -f k8s/secret.yaml

# Create configmap
kubectl apply -f k8s/configmap.yaml

# Deploy applications
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml

# Create services
kubectl apply -f k8s/services.yaml

# Create ingress
kubectl apply -f k8s/ingress.yaml

# Check deployment
kubectl get all -n olympia-custom
kubectl logs -n olympia-custom -l app=backend
```

---

## VPS Deployment (Manual)

### Without Docker

**1. Install dependencies**:
```bash
# Install Python
sudo apt install -y python3.12 python3.12-venv python3-pip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install Valkey
sudo apt install -y valkey-server
```

**2. Setup PostgreSQL**:
```bash
sudo -u postgres psql

CREATE DATABASE olympia_db;
CREATE USER olympia_user WITH PASSWORD 'secure-password';
GRANT ALL PRIVILEGES ON DATABASE olympia_db TO olympia_user;
\q
```

**3. Setup backend**:
```bash
cd /var/www/olympia-custom/backend/app

# Create virtual environment
python3.12 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Create systemd service
sudo nano /etc/systemd/system/olympia-backend.service
```

**Systemd service** (`/etc/systemd/system/olympia-backend.service`):
```ini
[Unit]
Description=Olympia Custom Backend
After=network.target postgresql.service valkey.service

[Service]
Type=notify
User=www-data
Group=www-data
WorkingDirectory=/var/www/olympia-custom/backend/app
Environment="PATH=/var/www/olympia-custom/backend/app/venv/bin"
ExecStart=/var/www/olympia-custom/backend/app/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

**4. Setup frontend**:
```bash
cd /var/www/olympia-custom/frontend

# Install dependencies
npm install

# Build for production
npm run build

# Setup Nginx to serve static files
sudo nano /etc/nginx/sites-available/olympia-frontend
```

**5. Enable and start services**:
```bash
# Enable backend service
sudo systemctl daemon-reload
sudo systemctl enable olympia-backend
sudo systemctl start olympia-backend

# Enable Nginx site
sudo ln -s /etc/nginx/sites-available/olympia-frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## SSL/TLS Configuration

### Using Certbot

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com -d api.your-domain.com

# Auto-renewal (already configured by certbot)
sudo certbot renew --dry-run
```

### Manual SSL Configuration

**nginx.conf**:
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com api.your-domain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://localhost:8000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name your-domain.com api.your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## Environment Variables

### Production Environment File

**configs/.env.production**:
```bash
# Security
SECRET_KEY=your-super-secret-key-min-32-characters-random
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Database
POSTGRES_DB_USER=olympia_user
POSTGRES_DB_PASSWORD=very-secure-password-here
POSTGRES_DB_HOST=postgres
POSTGRES_DB_PORT=5432
POSTGRES_DB_NAME=olympia_db

# Valkey
VALKEY_USER=default
VALKEY_PASSWORD=secure-valkey-password
VALKEY_HOST=valkey
VALKEY_PORT=6379

# Email/SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-smtp-user@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM_NAME="Olympia Custom"
FRONTEND_URL=https://your-domain.com

# CORS
ALLOWED_ORIGINS=https://your-domain.com,https://admin.your-domain.com

# Logging
LOG_LEVEL=INFO
LOG_FORMAT=json

# Google Drive
DRIVE_CREDENTIALS_FILE=credentials.json

# Application
ENVIRONMENT=production
DEBUG=False
```

---

## Database Setup

### Initial Setup

```bash
# Connect to PostgreSQL
docker-compose -f docker-compose.prod.yaml exec postgres psql -U olympia_user -d olympia_db

# Run migrations
docker-compose -f docker-compose.prod.yaml exec backend alembic upgrade head

# Create admin user
curl -X POST http://localhost/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "user_name": "Admin User",
    "user_code": "OC_U001",
    "password": "secure-admin-password",
    "role": "admin"
  }'
```

### Database Optimization

```sql
-- Enable query logging
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();

-- Create recommended indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role_active ON users(role) WHERE is_deleted = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_records_created ON records(created_at DESC);

-- Analyze tables
ANALYZE users;
ANALYZE matches;
ANALYZE questions;
ANALYZE answers;
ANALYZE records;
```

---

## Monitoring & Logging

### Health Checks

```bash
# Basic health check
curl http://localhost/health

# Detailed health (with database)
curl http://localhost/health/detailed

# Check all services
docker-compose -f docker-compose.prod.yaml ps
```

### Log Aggregation

**Docker logging driver** (docker-compose.yaml):
```yaml
services:
  backend:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Prometheus + Grafana Stack

**docker-compose.monitoring.yaml**:
```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"
    networks:
      - olympia-network

  grafana:
    image: grafana/grafana:latest
    volumes:
      - grafana_data:/var/lib/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=secure-grafana-password
    networks:
      - olympia-network

  node-exporter:
    image: prom/node-exporter:latest
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    networks:
      - olympia-network

volumes:
  prometheus_data:
  grafana_data:
```

---

## Backup & Recovery

### Automated Backups

**backup.sh**:
```bash
#!/bin/bash

BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# PostgreSQL backup
docker-compose -f docker-compose.prod.yaml exec -T postgres pg_dump -U olympia_user olympia_db | gzip > $BACKUP_DIR/postgres_$DATE.sql.gz

# Valkey backup
docker-compose -f docker-compose.prod.yaml exec valkey valkey-cli -a $VALKEY_PASSWORD BGSAVE
sleep 5
cp /var/lib/docker/volumes/olympia-custom_valkey_data/_data/dump.rdb $BACKUP_DIR/valkey_$DATE.rdb

# Delete old backups
find $BACKUP_DIR -name "*.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "*.rdb" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $DATE"
```

**Cron job** (daily at 2 AM):
```cron
0 2 * * * /path/to/backup.sh >> /var/log/olympia-backup.log 2>&1
```

### Disaster Recovery

**Recovery steps**:
1. Stop all services: `docker-compose down`
2. Restore PostgreSQL: `gunzip -c backup.sql.gz | docker-compose exec -T postgres psql -U olympia_user -d olympia_db`
3. Restore Valkey: Copy dump.rdb and restart Valkey
4. Start services: `docker-compose up -d`
5. Verify: Check health endpoints and logs

---

## Troubleshooting

### Common Deployment Issues

**Problem**: Container won't start

**Solution**:
```bash
# Check logs
docker-compose -f docker-compose.prod.yaml logs backend

# Check resource usage
docker stats

# Verify environment variables
docker-compose -f docker-compose.prod.yaml config
```

**Problem**: Database connection refused

**Solution**:
```bash
# Check PostgreSQL is running
docker-compose -f docker-compose.prod.yaml ps postgres

# Test connection
docker-compose -f docker-compose.prod.yaml exec postgres pg_isready

# Check network
docker-compose -f docker-compose.prod.yaml exec backend ping postgres
```

**Problem**: SSL certificate errors

**Solution**:
```bash
# Renew certificate
sudo certbot renew

# Check Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

**Problem**: WebSocket connections fail

**Solution**:
1. Verify Nginx WebSocket configuration
2. Check firewall allows WebSocket traffic
3. Verify backend WebSocket endpoint is accessible

---

## Related Documentation

- [Backend README](../backend/README.md) - Backend API reference
- [Frontend README](../frontend/README.md) - Frontend deployment
- [Data Schemas](../data-schemas/README.md) - Database schemas
- [Testing](../testing/test-scenarios.md) - Test scenarios
