# Architecture Documentation

This document provides a comprehensive overview of the OLYMPIA CUSTOM 3 frontend architecture, including project structure, routing, state management, and key patterns.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Routing Architecture](#routing-architecture)
5. [State Management](#state-management)
6. [Type System](#type-system)
7. [Real-time Communication](#real-time-communication)
8. [Styling Strategy](#styling-strategy)
9. [Build & Development](#build--development)
10. [Key Patterns](#key-patterns)
11. [Directory Organization Principles](#directory-organization-principles)
12. [Development Workflow](#development-workflow)

---

## Project Overview

**Name:** OLYMPIA CUSTOM 3 Frontend
**Type:** Web Application (SPA)
**Purpose:** Real-time multiplayer quiz game with admin and player interfaces
**Roles:** Admin (game control), Player (gameplay)
**Game Rounds:**
- Khởi Động Chung (Group Warm-up)
- Khởi Động Riêng (Individual Warm-up)
- Bứt Phá (Sprint)
- Vượt Đèo (Escape/Clue-based)

The application supports bidirectional real-time communication via WebSocket for game synchronization and uses REST API for persistent data storage.

---

## Technology Stack

| Technology | Purpose | Version |
|------------|---------|---------|
| **React** | UI framework and component system | 19.2.0 |
| **TypeScript** | Static type checking | 5.9.3 |
| **React Router DOM** | Client-side routing | 7.13.0 |
| **Vite** | Build tool and dev server | 7.2.4 |
| **SWC** | Fast TypeScript/JSX transpiler (via Vite plugin) | - |
| **Tailwind CSS** | Utility-first CSS framework | 4.1.18 |
| **PostCSS** | CSS processing | 10.4.23 |
| **Lucide React** | Icon library | 0.563.0 |
| **ESLint** | Code quality and style checking | 9.39.1 |

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
│   │   ├── admin/              # Admin page views
│   │   ├── player/             # Player page views
│   │   └── auth/               # Login & Signup pages
│   ├── routes/                 # Route definitions and guards
│   ├── types/                  # TypeScript type definitions
│   ├── utils/                  # Utility functions
│   ├── navigation/             # Navigation components (NavBar)
│   ├── App.tsx                 # Root component
│   ├── main.tsx                # React entry point
│   └── index.css               # Global styles
├── docs/                        # Documentation
│   ├── COMPONENTS.md
│   ├── API.md
│   └── ARCHITECTURE.md
├── package.json                 # Dependencies and scripts
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript configuration
├── tailwind.config.cjs         # Tailwind CSS configuration
└── eslint.config.js            # ESLint configuration
```

---

## Routing Architecture

### Application Routing

**File:** `src/App.tsx`

**Structure:**
- Root: `BrowserRouter` with background image
- Public routes: `/login`, `/signup`
- Role-specific routes:
  - `/admin/*` → `AdminRoutes` (protected)
  - `/player/*` → `PlayerRoutes` (protected)
- Root `/` redirects to `/login`

**Route Configuration:**
```typescript
<Routes>
  <Route path="/" element={<Navigate to="/login" replace />} />
  <Route path="/signup" element={<SignupPage />} />
  <Route path="/login" element={<LoginPage />} />
  <Route path="/player/*" element={<PlayerRoutes />} />
  <Route path="/admin/*" element={<AdminRoutes />} />
</Routes>
```

---

### Player Routes

**File:** `src/routes/PlayerRoutes.tsx`

**Protection:** `ProtectedPlayerRoute` checks for:
- `jwtToken_player` in sessionStorage
- `playerCode` matches required parameter

**WebSocket Integration:** `PlayerWebSocketWrapper` (conditional on matchCode availability)

**Routes:**

| Path | Component | Purpose |
|------|-----------|---------|
| `/access` | `PGameAccessPage` | Enter match code |
| `/waiting` | `PWaitingPage` | Wait for game start |
| `/kdc/:matchCode/:playerCode` | `PKhoiDongChungPage` | Group warm-up round |
| `/kdr/:matchCode/:playerCode` | `PKhoiDongRiengPage` | Individual warm-up |
| `/bp/:matchCode/:playerCode` | `PButPhaPage` | Sprint round |

**Event Listener:**
- `"oc3_matchCode_set"` custom event → initializes WebSocket connection

---

### Admin Routes

**File:** `src/routes/AdminRoutes.tsx`

**Protection:** `ProtectedAdminRoute` checks for:
- `jwtToken_admin` in localStorage
- `role === "admin"`

**WebSocket Integration:** `AdminWebSocketProvider` (always active)

**Routes:**

| Path | Component | Purpose |
|------|-----------|---------|
| `/game-managing` | `AGameManagingPage` | Admin dashboard |
| `/kdc/:matchCode` | `AKhoiDongChungPage` | Group warm-up admin |
| `/bp/:matchCode` | `AButPhaPage` | Sprint round admin |

---

## State Management

### Philosophy: Hook-based + Context API

The application eschews heavy state management libraries (Redux, Zustand) in favor of:

1. **Custom hooks** for reusable state logic
2. **React Context** for global/shared state (WebSocket)
3. **Local component state** (`useState`) for UI-specific state

---

### WebSocket State

#### useWebSocket

**File:** `src/hooks/useWebSocket.ts`

**Purpose:** Manages single WebSocket connection with reconnection and message draining.

**State:**
- `rawIsConnected`: boolean
- `lastMessage`: MessageEvent | null
- `_closure`: boolean (internal flag)

**Features:**
- **Message draining:** Messages buffered in async queue to prevent loss during handler execution
- **Auto-reconnect:** 3-second delay on disconnect
- **Cleanup:** Closure flag prevents state updates after unmount
- **Connection gating:** Only connects when `matchCode` prop is truthy

**API:**
```typescript
const { isConnected, lastMessage, sendMessage } = useWebSocket(matchCode);
```

#### Context Wrappers

**AdminWebSocketContext** (`src/contexts/AdminWebSocketContext.tsx`):
- Wraps `useWebSocket` with admin-specific matchCode resolution (from localStorage or URL param)
- Auto-sends `request_presence` on connection
- Provides `useAdminWebSocket()` hook

**PlayerWebSocketContext** (`src/contexts/PlayerWebSocketContext.tsx`):
- Wraps `useWebSocket` with player-specific matchCode (from sessionStorage or URL param)
- Auto-sends `player_online` on connection
- Listens for `navigate` messages and redirects
- Provides `usePlayerWebSocket()` hook

---

### Session State

#### useAuthSession

**File:** `src/hooks/useAuthSession.ts`

**Methods:**
- `saveSession(data)`: Saves JWT token, role, match code to appropriate storage and navigates
- `clearSession()`: Clears all storage keys

**Storage mapping:**
- Admin: `localStorage`
- Player: `sessionStorage`

---

#### usePlayerSession

**File:** `src/hooks/usePlayerSession.ts`

**Purpose:** Read-only snapshot of player session for components

**Returns:**
```typescript
{
  matchCode: string | null;
  playerCode: string | null;
  token: string | null;
}
```

**Reactivity:** Listens to `storage` event for cross-tab sync

---

### Question State

#### useQuestionState

**File:** `src/hooks/useQuestionState.ts`

**Purpose:** Manage current question and question index.

**State:**
- `currentQuestion`: Question | null
- `currentQuestionIndex`: number

**Actions:**
- `setQuestion(question)`: Set current question
- `setQuestionIndex(index)`: Set current index
- `resetQuestion()`: Clear question and index

**WebSocket Integration:**
- Listens for `send_question` and `clear_question` messages
- Extracts index from question code (e.g., "BP_01" → 1)

---

### Timer State

#### useCountdownTimer

**File:** `src/hooks/useCountdownTimer.ts`

**Purpose:** Countdown timer with start/stop/reset.

**State:**
- `timer`: number (remaining seconds)
- `timeLimit`: number (total duration)
- `timerDisplay`: string (MM:SS format)
- `isRunning`: boolean

**Methods:**
- `start()`: Begin countdown
- `stop()`: Pause countdown
- `reset()`: Reset to full duration
- `getElapsedSeconds()`: Returns elapsed time

**Mechanism:**
- Uses `setInterval` at 1-second intervals
- `useEffect` cleanup on unmount

---

### Component-Level State

Components use `useState` for UI-specific state:

- `players`: Player list
- `selectedAnswers`: Multi-select state
- `showAnswers`: Toggle visibility
- `answerText`: Input field value
- `isBuzzed`: Buzzed state

---

## Type System

### Type Definitions

**Location:** `src/types/`

#### player.ts

```typescript
interface PlayerStatus {
  playerCode: string;
  playerName: string;
  playerScore: number;
  playerLastAnswer?: string;
  playerTimestamp?: number;
  playerHasBuzzed?: boolean;
  playerConnected?: boolean;
}
```

#### question.ts

```typescript
interface Question {
  questionCode: string;
  questionText: string;
  questionAnswer: string;
  questionExplanation?: string;
  questionMediaURL?: string;
}
```

#### questionBoardTypes.ts

```typescript
type ControlVariant = "numbers" | "subjects";

interface BaseQuestionBoardControls {
  showAnswers: boolean;
  onToggleAnswers: () => void;
  currentIndex: number;
  count: number;
  boxStates: boolean[];
  activeIndices: number[];
  toggle: (index: number) => void;
}

interface AdminQuestionBoardControls extends BaseQuestionBoardControls {
  onToggle?: (index: number, state: boolean) => void;
}

type PlayerQuestionBoardControls = BaseQuestionBoardControls;
```

---

## Real-time Communication

### WebSocket Architecture

**Connection Flow:**

1. **Player:**
   - Enters match code on `/player/access`
   - Loads `PlayerWebSocketProvider` on player routes
   - URL encoded: `ws://localhost:8000/ws/{matchCode}`
   - Auto-sends `player_online` with `user_code`
   - Listens for `navigate` → redirect player

2. **Admin:**
   - Navigate to `/admin/game-managing` or round pages
   - `AdminWebSocketProvider` always active
   - Resolves `matchCode` from localStorage or URL
   - Auto-sends `request_presence` to build player list

**Message Flow:**
- Admin sends `send_players_info` with combined data
- Players respond to `request_presence` with `player_online`
- Admin triggers game events (question, timer, answers)
- Players submit answers and buzz via WebSocket

**Fallback to HTTP:**
- Answers can be saved via POST `/answers/`
- Score fetching via GET `/scoreboard/`
- But WebSocket is primary real-time channel

---

## Styling Strategy

### Tailwind CSS

**Configuration:** `tailwind.config.cjs`

- Uses PostCSS 4 with `@tailwindcss/postcss` and `@tailwindcss/vite`
- Content paths: `["/src/**/*.{ts,tsx}"]`
- Custom theme:
  - Colors: Blue scale (`blue-900`, `blue-600`, `blue-300`)
  - Font: "SVN-Gratelos_Display" for headings

**Global Styles:** `src/index.css`

```css
@import url('https://fonts.googleapis.com/css2?family=SVN-Gratelos_Display&display=swap');

body {
  font-family: 'SVN-Gratelos_Display', sans-serif;
  @apply bg-gray-100;
}
```

---

### Design System

**Color Palette:**
- Primary blue: `blue-900` (dark), `blue-600` (medium), `blue-300` (light)
- Success: `green-500`, `green-600`
- Error/Danger: `red-500`, `black` (incorrect answers)
- Neutral: `gray-200`, `gray-400`, `gray-600`, `white`
- Connection status: `green-400`

**Spacing:**
- Consistent use of Tailwind spacing scale (`p-2`, `p-3`, `m-2`, `gap-4`)

**Typography:**
- Font: "SVN-Gratelos_Display" for Vietnamese text
- Sizes: `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`

**Layout:**
- Flexbox for component layouts
- `h-[60vh]` or `h-[40vh]` for question board heights
- Responsive grid for player lists

**Background:**
- Fixed background image: `/background/OC3_background.png`
- Set on root div in `App.tsx`

---

## Build & Development

### Scripts

**package.json:**

```json
{
  "scripts": {
    "dev": "vite",                    // Dev server with HMR
    "build": "tsc -b && vite build", // Type check then bundle
    "lint": "eslint .",               // ESLint check
    "preview": "vite preview"         // Preview production build
  }
}
```

### Configuration Files

**vite.config.ts:**
- React plugin: `@vitejs/plugin-react-swc`
- Path alias: `@` → `./src/`
- Server: default (port 5173)

**tsconfig.json:**
- Target: ES2022
- Module: ESNext
- JSX: react-jsx
- Strict: true
- Path mapping: `@/*` → `src/*`
- References: `tsconfig.app.json` and `tsconfig.node.json`

**eslint.config.js:**
- Uses `@eslint/js` recommended rules
- Plugins: `react`, `react-hooks`, `react-refresh`
- Global `globals` import

---

### Directory Conventions

- **Components:** PascalCase filenames (`MyComponent.tsx`)
- **Hooks:** `use` prefix (`useMyHook.ts`)
- **Pages:** PascalCase (`DashboardPage.tsx`)
- **Utils:** camelCase (`playerHelpers.ts`, `logger.ts`)
- **Types:** PascalCase (`player.ts`, `question.ts`)

---

## Key Patterns

### 1. Render Props

`AQuestionBoard` accepts `children` as render prop for flexible controls:

```tsx
<AQuestionBoard controls="subjects" {...props}>
  {({ variant, count, boxStates, toggle }) => (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <button onClick={() => toggle(i)}>
          {boxStates[i] ? '✓' : '○'}
        </button>
      ))}
    </div>
  )}
</AQuestionBoard>
```

---

### 2. Controlled Components

All form inputs follow React controlled pattern:

```tsx
const [value, setValue] = useState("");

<InputField
  value={value}
  onChange={e => setValue(e.target.value)}
  // ...other props
/>
```

---

### 3. Context + Hook Pattern

Context provides global state; custom hook consumes it:

```typescript
// Context
const MyContext = React.createContext<MyContextType | null>(null);

// Provider
export const MyProvider = ({ children }) => {
  const [state, setState] = useState(initial);
  return (
    <MyContext.Provider value={{ state, setState }}>
      {children}
    </MyContext.Provider>
  );
};

// Hook
export const useMyContext = () => {
  const context = useContext(MyContext);
  if (!context) throw new Error("Must be used within provider");
  return context;
};
```

---

### 4. Message Draining

`useWebSocket` uses async generator to drain message queue:

```typescript
const messageQueue: MessageEvent[] = [];

ws.onmessage = (event) => {
  messageQueue.push(event);
};

// Async iterator
while (!closure) {
  if (messageQueue.length > 0) {
    const message = messageQueue.shift()!;
    setLastMessage(message);
  }
  await new Promise(resolve => setTimeout(resolve, 0));
}
```

This prevents message pileup during slow handlers.

---

### 5. Auto-navigation via WebSocket

Admin can trigger client navigation:

```typescript
// Server sends
{
  "type": "navigate",
  "path": "/kdc/MATCH123/PLAYER001"
}

// PlayerWebSocketContext handles:
if (message.type === "navigate") {
  navigate(message.path);
}
```

---

## Directory Organization Principles

### Separation by Role

Components, pages, and contexts split into `admin/` and `player/` subdirectories based on which user role uses them. Shared items go in `shared/` or top-level.

### Feature-Based Grouping

Related functionality grouped together:

- **Round-specific pages**: Separate files (`PKhoiDongChungPage.tsx`, `PButPhaPage.tsx`)
- **Common hooks**: Single directory `hooks/`
- **Type definitions**: Grouped in `types/` by domain (`player`, `question`)

### Reusability First

If a component could be used by both roles → place in `components/shared/`. Only duplicate when necessary for role-specific behavior.

---

## Development Workflow

### Git Branches

- `main`: Production-ready
- `dev/oc3-app`: Active development branch

Recent commit history shows focus on:
- WebSocket fixes
- UI/UX updates for KhoiDongChung and ButPha pages

---

### Adding a New Feature

1. **Plan:**
   - Identify affected pages/components
   - Determine if WebSocket messages needed
   - Define API endpoints if required

2. **Types:**
   - Add TypeScript interfaces in `src/types/`

3. **API:**
   - Add fetch functions or extend existing pages
   - Handle errors with try-catch and user feedback

4. **Components:**
   - Create reusable component in appropriate `components/` folder
   - Or extend existing page component

5. **Routing (if new page):**
   - Add component to `pages/` (admin/ or player/)
   - Add route to `AdminRoutes.tsx` or `PlayerRoutes.tsx`

6. **WebSocket:**
   - Update contexts if new message types needed
   - Add case handlers in `useEffect` listeners

7. **Testing:**
   - Manual testing with both admin and player views
   - Check WebSocket message flow
   - Verify error handling

8. **Documentation:**
   - Update relevant docs (`COMPONENTS.md`, `API.md`, `ARCHITECTURE.md`)

---

### Code Quality Standards

- **TypeScript strict mode:** No implicit `any`
- **ESLint:** Run before commits
- **Minimal `any` usage:** Only when absolutely necessary, document why
- **Error handling:** Use try-catch for async operations; provide user feedback
- **Cleanup:** Use `useEffect` return functions to prevent memory leaks
- **Console logging:** Use `logger` utility instead of raw `console.log`
- **Comments:** Document complex logic; prefer self-documenting code

---

## Performance Considerations

- **Bundle size:** Tree-shaking via ES modules (Vite)
- **Code splitting:** Automatic via React.lazy() could be added in future
- **WebSocket reconnection:** 3-second delay prevents server overload
- **Message draining:** Processes messages sequentially without loss
- **Tailwind:** Purge unused CSS in production build

---

## Scalability

Current architecture supports:

- **Multiple concurrent matches:** WebSocket URL includes matchCode, isolating matches
- **Multiple players per match:** Player list scaled in state
- **Round variations:** Separate page components allow different UIs per round
- **API centralization:** All endpoints under `/api/v1` (implied)

Potential scalability challenges:
- Single WebSocket per player/admin could be optimized with connection pooling (not needed)
- Large player lists (50+) may need virtualization (not currently designed for)
- Admin player list fetches all players at once (could paginate)

---

## Future Enhancements

Based on codebase patterns, potential improvements:

1. **State Management:** Introduce Zustand if global state grows beyond WebSocket
2. **Error Boundaries:** Wrap each page with ErrorBoundary for graceful failures
3. **Unit Tests:** Add Jest/Vitest for hooks and utilities
4. **End-to-End Tests:** Use Cypress or Playwright for full flows
5. **API Versioning:** Add `/api/v1/` prefix for future-proofing
6. **Real-time API:** GraphQL subscriptions could replace custom WebSocket protocol
7. **Internationalization:** i18n framework for Vietnamese/English support
8. **Responsive Design:** Mobile-first breakpoints (currently desktop-focused)
9. **Accessibility:** Full WCAG compliance (ARIA, keyboard nav)
10. **Offline Support:** Service Worker for cached assets

---

## Troubleshooting

### Common Issues

**WebSocket connection fails:**
- Check backend is running on port 8000
- Verify `matchCode` is set in URL or storage
- Check browser console for CORS errors
- Inspect Network tab for WS handshake

**Player not appearing in admin list:**
- Ensure player has connected WebSocket and sent `player_online`
- Check admin sent `request_presence` or refreshed players
- Verify player has same `matchCode`

**Auth redirect loop:**
- Check token is valid (not expired)
- Verify localStorage/sessionStorage keys
- Ensure ProtectedRoute logic matches role

**Build errors:**
- Run `npm install` to restore dependencies
- Check TypeScript version compatibility
- Verify `tsconfig.json` path mappings

---

## Conclusion

The OLYMPIA CUSTOM 3 frontend is a well-structured React application using modern best practices:

- TypeScript for type safety
- React Router for declarative routing
- Context API for global state
- WebSocket for real-time features
- Tailwind for utility-first styling

The architecture cleanly separates concerns between admin and player interfaces while sharing common components and utilities. The codebase is maintainable, testable, and extensible for future game round additions.

---

**Related Documents:**
- `COMPONENTS.md` - Component library documentation
- `API.md` - API endpoints and WebSocket reference
