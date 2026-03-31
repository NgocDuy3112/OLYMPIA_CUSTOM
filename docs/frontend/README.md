# OLYMPIA CUSTOM 3 — Frontend Documentation

Complete documentation for the OLYMPIA CUSTOM 3 quiz game frontend application.

---

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Documentation Index](#documentation-index)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)

---

## Overview

**Name**: OLYMPIA CUSTOM 3 Frontend  
**Type**: Single Page Application (SPA)  
**Purpose**: Real-time multiplayer quiz game interface  
**Roles**: Admin (game control), Player (gameplay)

### Game Rounds

| Round | Vietnamese | English | Description |
|-------|------------|---------|-------------|
| **VL** | Vòng Loại | Qualifier | Preliminary qualification round |
| **KDC** | Khởi Động Chung | Group Warm-up | All players answer same questions |
| **KDR** | Khởi Động Riêng | Individual Warm-up | Players answer individual questions |
| **BP** | Bứt Phá | Sprint | Fast-paced buzzer round |
| **VD** | Vượt Đèo | Escape | Clue-based challenge round |
| **VDC** | Về Đích Chung | Final Group Stage | Final group round |
| **VDR** | Về Đích Riêng | Final Individual Stage | Final individual round |
| **GM** | Giải Mã | Decode | Mystery/decoding round |

---

## Technology Stack

| Technology | Purpose | Version |
|------------|---------|---------|
| **React** | UI framework | 19.2.0 |
| **TypeScript** | Type safety | 5.9.3 |
| **React Router** | Routing | 7.13.0 |
| **Vite** | Build tool | 7.2.4 |
| **Tailwind CSS** | Styling | 4.1.18 |
| **Lucide React** | Icons | 0.563.0 |

---

## Documentation Index

### [API Documentation](./API.md)

Complete reference for all HTTP API endpoints and WebSocket communication.

**Contents**:
- HTTP API endpoints (auth, users, matches, questions, answers, records, scoreboard)
- WebSocket connection and message types
- Session management
- Error handling
- Request/response examples

### [Architecture Documentation](./ARCHITECTURE.md)

Comprehensive overview of the frontend architecture.

**Contents**:
- Project structure
- Routing architecture
- State management
- Type system
- Real-time communication
- Styling strategy
- Key patterns

### [Components Documentation](./COMPONENTS.md)

Detailed documentation for all React components.

**Contents**:
- Shared components (InputField, RenderMedia, ErrorBoundary)
- Admin components (AQuestionBoard, APlayerBar, AVuotDeoClue)
- Player components (PQuestionBoard, PAnswerBox, PSubmitButton, PVuotDeoClue)
- Component patterns and best practices

---

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Backend running on `http://localhost:8000`

### Installation

```bash
cd frontend
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

---

## Project Structure

```
frontend/
├── public/                      # Static assets
│   ├── background/              # Game background images
│   └── oc3_logo.png
├── src/
│   ├── components/              # Reusable UI components
│   │   ├── admin/              # Admin-specific components
│   │   ├── player/             # Player-specific components
│   │   └── shared/             # Shared components
│   ├── contexts/               # React Context providers
│   ├── hooks/                  # Custom React hooks
│   ├── pages/                  # Full page components
│   │   ├── admin/              # Admin pages
│   │   ├── player/             # Player pages
│   │   └── auth/               # Login & Signup
│   ├── routes/                 # Route definitions and guards
│   ├── types/                  # TypeScript type definitions
│   ├── utils/                  # Utility functions
│   ├── navigation/             # Navigation components
│   ├── configs.ts              # Configuration constants
│   ├── App.tsx                 # Root component
│   ├── main.tsx                # Entry point
│   └── index.css               # Global styles
├── docs/                        # Documentation
│   ├── README.md               # This file
│   ├── API.md                  # API reference
│   ├── ARCHITECTURE.md         # Architecture overview
│   └── COMPONENTS.md           # Component library
├── package.json                 # Dependencies
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript configuration
├── tailwind.config.cjs         # Tailwind configuration
└── eslint.config.js            # ESLint configuration
```

---

## Key Features

### Real-Time Communication

- **WebSocket**: Primary communication channel for game events
- **Automatic Reconnection**: 3-second delay on disconnect
- **Message Draining**: Prevents message loss during slow handlers

### Role-Based Interfaces

- **Admin Interface**: Game control, question management, scoring
- **Player Interface**: Answer submission, buzzer, score display

### Session Management

- **Admin**: Persistent sessions (localStorage)
- **Player**: Session-based sessions (sessionStorage)

### Responsive Design

- Desktop-first approach
- Tailwind CSS utility classes
- Custom font: SVN-Gratelos Display

---

## Environment Variables

### Configuration Files

| File | Purpose |
|------|---------|
| `.env` | Local development (not committed) |
| `.env.example` | Template for environment variables |
| `.env.production` | Production builds |

### Available Variables

```bash
# API Configuration
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000

# Feature Flags
VITE_ENABLE_DEBUG=true
VITE_ENABLE_MOCK_API=false

# Analytics (Optional)
VITE_ANALYTICS_ID=UA-XXXXXXXXX-X
VITE_SENTRY_DSN=https://xxx@o0.ingest.sentry.io/0

# CDN (Optional)
VITE_CDN_URL=https://cdn.your-domain.com
```

### Usage in Code

```typescript
// Access environment variables
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
const DEBUG = import.meta.env.VITE_ENABLE_DEBUG === 'true';

// In API client
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});
```

### Environment-Specific Configurations

**Development** (`.env`):
```bash
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
VITE_ENABLE_DEBUG=true
```

**Staging** (`.env.staging`):
```bash
VITE_API_URL=https://staging-api.your-domain.com
VITE_WS_URL=wss://staging-api.your-domain.com
VITE_ENABLE_DEBUG=false
```

**Production** (`.env.production`):
```bash
VITE_API_URL=https://api.your-domain.com
VITE_WS_URL=wss://api.your-domain.com
VITE_ENABLE_DEBUG=false
VITE_SENTRY_DSN=https://xxx@o0.ingest.sentry.io/0
```

---

## Deployment

### Build for Production

```bash
# Install dependencies
npm install

# Build optimized bundle
npm run build

# Preview production build locally
npm run preview
```

### Build Output

```
frontend/
├── dist/                    # Production build output
│   ├── index.html          # Main HTML
│   ├── assets/             # Bundled assets
│   │   ├── index-[hash].js  # Main JS bundle
│   │   ├── index-[hash].css # Main CSS bundle
│   │   └── [hash]-[name].[ext]  # Static assets
│   └── vite-manifest.json  # Asset manifest
```

### Deployment Options

#### Option 1: Static File Server

```bash
# Install serve
npm install -g serve

# Serve dist directory
serve -s dist -l 3000
```

#### Option 2: Nginx

**nginx.conf**:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/olympia-frontend/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
}
```

#### Option 3: Docker

**Dockerfile**:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Build and run**:
```bash
docker build -t olympia-frontend .
docker run -p 80:80 olympia-frontend
```

#### Option 4: CDN + S3

```bash
# Install AWS CLI
aws configure

# Create S3 bucket
aws s3 mb s3://your-olympia-frontend

# Upload build
aws s3 sync dist/ s3://your-olympia-frontend/

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

### CI/CD Integration

**GitHub Actions** (`.github/workflows/deploy.yml`):
```yaml
name: Deploy Frontend

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
        env:
          VITE_API_URL: ${{ secrets.PROD_API_URL }}
          VITE_WS_URL: ${{ secrets.PROD_WS_URL }}
      
      - name: Deploy to S3
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - run: aws s3 sync dist/ s3://your-bucket/
      
      - run: aws cloudfront create-invalidation --distribution-id XXX --paths "/*"
```

---

## Performance Optimization

### Bundle Analysis

```bash
# Install bundle analyzer
npm install -D rollup-plugin-visualizer

# Add to vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    visualizer({ open: true })
  ]
})

# Run build and analyze
npm run build
```

### Code Splitting

```typescript
// Lazy load routes
const AdminDashboard = React.lazy(() => import('@/pages/admin/Dashboard'));
const PlayerGame = React.lazy(() => import('@/pages/player/Game'));

// In routes
<Route
  path="/admin"
  element={
    <Suspense fallback={<Loading />}>
      <AdminDashboard />
    </Suspense>
  }
/>
```

### Image Optimization

```bash
# Install sharp
npm install -D vite-plugin-image-optimizer

# Add to vite.config.ts
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'

export default defineConfig({
  plugins: [
    react(),
    ViteImageOptimizer({
      png: { quality: 80 },
      jpeg: { quality: 80 },
      webp: { quality: 80 }
    })
  ]
})
```

### Caching Strategies

**Service Worker** (Optional):
```typescript
// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW registered'))
      .catch(err => console.log('SW registration failed'));
  });
}
```

---

## Development Guidelines

### Code Style

- **TypeScript**: Strict mode enabled
- **Components**: Functional components with hooks
- **Naming**: PascalCase for components, camelCase for utilities
- **Files**: `.tsx` for components, `.ts` for utilities/types

### Component Structure

```typescript
import React from 'react';

interface MyComponentProps {
  prop1: string;
  prop2: number;
}

export const MyComponent: React.FC<MyComponentProps> = ({ prop1, prop2 }) => {
  // Component logic
  
  return (
    <div className="...">
      {/* JSX */}
    </div>
  );
};
```

### State Management

1. **Local State**: `useState` for component-specific state
2. **Shared State**: React Context for global state (WebSocket)
3. **Server State**: Custom hooks for API calls

### Error Handling

```typescript
try {
  const response = await fetch(...);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  return await response.json();
} catch (error) {
  console.error('API error:', error);
  throw error;
}
```

---

## Related Documentation

- [Backend API](../backend/README.md) - Backend endpoints
- [Data Schemas](../data-schemas/README.md) - Database schemas
- [WebSocket API](../backend/websocket.md) - Real-time communication

---

## Support

For issues or questions, refer to:
- Project documentation in `docs/`
- Backend documentation in `../docs/backend/`
- Code comments in source files
