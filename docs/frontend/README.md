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
| **KDC** | Khởi Động Chung | Group Warm-up | All players answer same questions |
| **KDR** | Khởi Động Riêng | Individual Warm-up | Players answer individual questions |
| **BP** | Bứt Phá | Sprint | Fast-paced buzzer round |
| **VD** | Vượt Đèo | Escape | Clue-based challenge round |

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
└── tailwind.config.cjs         # Tailwind configuration
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
