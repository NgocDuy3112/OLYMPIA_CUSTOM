# Frontend Architecture Documentation

Comprehensive overview of the OLYMPIA CUSTOM 3 frontend architecture.

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

---

## Project Overview

**Name**: OLYMPIA CUSTOM 3 Frontend  
**Type**: Single Page Application (SPA)  
**Purpose**: Real-time multiplayer quiz game  
**Roles**: 
- **Admin**: Game control, scoring, question management
- **Player**: Gameplay, answer submission, buzzer

### Game Rounds

| Code | Vietnamese | English | Type |
|------|------------|---------|------|
| **VL** | Vòng Loại | Qualifier | Preliminary qualification round |
| **KDC** | Khởi Động Chung | Group Warm-up | All players answer same questions |
| **KDR** | Khởi Động Riêng | Individual Warm-up | Individual questions |
| **BP** | Bứt Phá | Sprint | Fast-paced buzzer round |
| **VD** | Vượt Đèo | Escape | Clue-based challenge |
| **VDC** | Về Đích Chung | Final Group Stage | Final group round |
| **VDR** | Về Đích Riêng | Final Individual Stage | Final individual round |
| **GM** | Giải Mã | Decode | Mystery/decoding round |

---

## Technology Stack

| Technology | Purpose | Version |
|------------|---------|---------|
| **React** | UI framework | 19.2.0 |
| **TypeScript** | Type safety | 5.9.3 |
| **React Router DOM** | Client-side routing | 7.13.0 |
| **Vite** | Build tool & dev server | 7.2.4 |
| **SWC** | Fast transpiler (via Vite) | - |
| **Tailwind CSS** | Utility-first CSS | 4.1.18 |
| **PostCSS** | CSS processing | 10.4.23 |
| **Lucide React** | Icon library | 0.563.0 |
| **ESLint** | Code quality | 9.39.1 |

---

## Project Structure

```
frontend/
├── public/                          # Static assets
│   ├── background/                  # Game background images
│   └── oc3_logo.png                 # Logo
├── src/
│   ├── components/                  # Reusable UI components
│   │   ├── admin/                   # Admin-specific components
│   │   │   ├── AQuestionBoard.tsx   # Question display with controls
│   │   │   ├── APlayerBar.tsx       # Player status bar
│   │   │   └── AVuotDeoClue.tsx     # Vượt Đèo clue component
│   │   ├── player/                  # Player-specific components
│   │   │   ├── PQuestionBoard.tsx   # Read-only question display
│   │   │   ├── PAnswerBox.tsx       # Answer input
│   │   │   ├── PSubmitButton.tsx    # Buzzer/submit button
│   │   │   └── PVuotDeoClue.tsx     # Player clue component
│   │   └── shared/                  # Shared components
│   │       ├── InputField.tsx       # Form input wrapper
│   │       ├── RenderMedia.tsx      # Media renderer
│   │       └── ErrorBoundary.tsx    # Error boundary
│   ├── contexts/                    # React Context providers
│   │   ├── AdminWebSocketContext.tsx
│   │   └── PlayerWebSocketContext.tsx
│   ├── hooks/                       # Custom React hooks
│   │   ├── useWebSocket.ts          # WebSocket connection
│   │   ├── useAuthSession.ts        # Session management
│   │   ├── usePlayerSession.ts      # Player session snapshot
│   │   ├── useQuestionState.ts      # Question state management
│   │   ├── useCountdownTimer.ts     # Timer logic
│   │   ├── usePlayerPresence.ts     # Player presence tracking
│   │   ├── useAdminWebSocket.ts     # Admin WebSocket context hook
│   │   └── usePlayerWebSocket.ts    # Player WebSocket context hook
│   ├── pages/                       # Full page components
│   │   ├── admin/                   # Admin pages
│   │   ├── player/                  # Player pages
│   │   └── auth/                    # Login & Signup
│   ├── routes/                      # Route definitions
│   │   ├── AdminRoutes.tsx          # Admin route guards
│   │   └── PlayerRoutes.tsx         # Player route guards
│   ├── types/                       # TypeScript definitions
│   │   ├── player.ts                # Player types
│   │   ├── question.ts              # Question types
│   │   └── questionBoardTypes.ts    # Question board types
│   ├── utils/                       # Utility functions
│   │   ├── logger.ts                # Logging utility
│   │   └── playerHelpers.ts         # Player helpers
│   ├── navigation/                  # Navigation components
│   ├── App.tsx                      # Root component
│   ├── main.tsx                     # Entry point
│   ├── configs.ts                   # Configuration
│   └── index.css                    # Global styles
├── docs/                            # Documentation
├── package.json                     # Dependencies
├── vite.config.ts                   # Vite config
├── tsconfig.json                    # TypeScript config
├── tailwind.config.cjs              # Tailwind config
└── eslint.config.js                 # ESLint config
```

---

## Routing Architecture

### Application Routes

**File**: `src/App.tsx`

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

**File**: `src/routes/PlayerRoutes.tsx`

**Protection**: `ProtectedPlayerRoute` checks:
- `jwtToken_player` in sessionStorage
- `playerCode` matches URL parameter

**WebSocket**: `PlayerWebSocketWrapper` (conditional on matchCode)

| Path | Component | Purpose |
|------|-----------|---------|
| `/access` | `PGameAccessPage` | Enter match code |
| `/waiting` | `PWaitingPage` | Wait for game start |
| `/vl/:matchCode/:playerCode` | `PVongLoaiPage` | Qualifier round |
| `/kdc/:matchCode/:playerCode` | `PKhoiDongChungPage` | Group warm-up |
| `/kdr/:matchCode/:playerCode` | `PKhoiDongRiengPage` | Individual warm-up |
| `/bp/:matchCode/:playerCode` | `PButPhaPage` | Sprint round |
| `/vd/:matchCode/:playerCode` | `PVuotDeoPage` | Escape round |
| `/vdc/pick/:matchCode/:playerCode` | `PVeDichChungPickPage` | Final group stage selection |
| `/vdc/:matchCode/:playerCode` | `PVeDichChungPage` | Final group stage |
| `/vdr/pick/:matchCode/:playerCode` | `PVeDichRiengPickPage` | Final individual selection |
| `/vdr/:matchCode/:playerCode` | `PVeDichRiengPage` | Final individual stage |
| `/gm/:matchCode/:playerCode` | `PGiaiMaPage` | Decode round |

---

### Admin Routes

**File**: `src/routes/AdminRoutes.tsx`

**Protection**: `ProtectedAdminRoute` checks:
- `jwtToken_admin` in localStorage
- `role === "admin"`

**WebSocket**: `AdminWebSocketProvider` (always active)

| Path | Component | Purpose |
|------|-----------|---------|
| `/game-managing` | `AGameManagingPage` | Admin dashboard |
| `/kdc/:matchCode` | `AKhoiDongChungPage` | Group warm-up admin |
| `/bp/:matchCode` | `AButPhaPage` | Sprint admin |

---

## State Management

### Philosophy: Hook-based + Context API

No heavy state management libraries (Redux, Zustand). Uses:
1. **Custom hooks** for reusable state logic
2. **React Context** for global state (WebSocket)
3. **Local component state** (`useState`) for UI-specific state

---

### WebSocket State

#### useWebSocket Hook

**File**: `src/hooks/useWebSocket.ts`

**State**:
- `rawIsConnected`: boolean
- `lastMessage`: MessageEvent | null
- `_closure`: boolean (internal cleanup flag)

**Features**:
- **Message draining**: Async queue prevents message loss
- **Auto-reconnect**: 3-second delay on disconnect
- **Connection gating**: Only connects when `matchCode` is truthy

**API**:
```typescript
const { isConnected, lastMessage, sendMessage } = useWebSocket(matchCode);
```

---

#### Context Wrappers

**AdminWebSocketContext** (`src/contexts/AdminWebSocketContext.tsx`):
- Wraps `useWebSocket` with admin-specific matchCode
- Auto-sends `request_presence` on connection
- Provides `useAdminWebSocket()` hook

**PlayerWebSocketContext** (`src/contexts/PlayerWebSocketContext.tsx`):
- Wraps `useWebSocket` with player-specific matchCode
- Auto-sends `player_online` on connection
- Listens for `navigate` messages → redirect
- Provides `usePlayerWebSocket()` hook

---

### Session State

#### useAuthSession

**File**: `src/hooks/useAuthSession.ts`

**Methods**:
- `saveSession(data)`: Save tokens and navigate
- `clearSession()`: Clear all storage keys

**Storage Mapping**:
- Admin: `localStorage`
- Player: `sessionStorage`

---

#### usePlayerSession

**File**: `src/hooks/usePlayerSession.ts`

**Returns**:
```typescript
{
  matchCode: string | null;
  playerCode: string | null;
  token: string | null;
}
```

**Reactivity**: Listens to `storage` event for cross-tab sync

---

### Question State

#### useQuestionState

**File**: `src/hooks/useQuestionState.ts`

**State**:
- `currentQuestion`: Question | null
- `currentQuestionIndex`: number

**Actions**:
- `setQuestion(question)`: Set current question
- `setQuestionIndex(index)`: Set current index
- `resetQuestion()`: Clear state

**WebSocket Integration**:
- Listens for `send_question` and `clear_question`
- Extracts index from question code (e.g., "BP_01" → 1)

---

### Timer State

#### useCountdownTimer

**File**: `src/hooks/useCountdownTimer.ts`

**State**:
- `timer`: number (remaining seconds)
- `timeLimit`: number (total duration)
- `timerDisplay`: string (MM:SS format)
- `isRunning`: boolean

**Methods**:
- `start()`: Begin countdown
- `stop()`: Pause countdown
- `reset()`: Reset to full duration
- `getElapsedSeconds()`: Get elapsed time

---

## Type System

### Type Definitions

**Location**: `src/types/`

#### Player Types

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

#### Question Types

```typescript
interface Question {
  questionCode: string;
  questionText: string;
  questionAnswer: string;
  questionExplanation?: string;
  questionMediaURL?: string;
}
```

#### Question Board Types

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
```

---

## Real-time Communication

### WebSocket Architecture

**Connection Flow**:

1. **Player**:
   - Enters match code on `/player/access`
   - Loads `PlayerWebSocketProvider` on player routes
   - URL: `ws://localhost:8000/ws/{matchCode}`
   - Auto-sends `player_online` with `user_code`
   - Listens for `navigate` → redirect

2. **Admin**:
   - Navigates to `/admin/game-managing` or round pages
   - `AdminWebSocketProvider` always active
   - Resolves `matchCode` from localStorage or URL
   - Auto-sends `request_presence` to build player list

**Message Flow**:
- Admin sends `send_players_info` with combined data
- Players respond to `request_presence` with `player_online`
- Admin triggers game events (question, timer, answers)
- Players submit answers and buzz via WebSocket

---

## Styling Strategy

### Tailwind CSS

**Configuration**: `tailwind.config.cjs`

- Uses PostCSS 4 with `@tailwindcss/postcss` and `@tailwindcss/vite`
- Content paths: `["/src/**/*.{ts,tsx}"]`

**Custom Theme**:
- Colors: Blue scale (`blue-900`, `blue-600`, `blue-300`)
- Font: "SVN-Gratelos_Display" for headings

---

### Global Styles

**File**: `src/index.css`

```css
@import url('https://fonts.googleapis.com/css2?family=SVN-Gratelos_Display&display=swap');

body {
  font-family: 'SVN-Gratelos_Display', sans-serif;
  @apply bg-gray-100;
}
```

---

### Design System

**Color Palette**:
- **Primary**: `blue-900` (dark), `blue-600` (medium), `blue-300` (light)
- **Success**: `green-500`, `green-600`
- **Error/Danger**: `red-500`, `black` (incorrect answers)
- **Neutral**: `gray-200`, `gray-400`, `gray-600`, `white`
- **Connection**: `green-400`

**Typography**:
- Font: "SVN-Gratelos_Display" for Vietnamese text
- Sizes: `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`

**Layout**:
- Flexbox for component layouts
- `h-[60vh]` or `h-[40vh]` for question board heights
- Responsive grid for player lists

**Background**:
- Fixed background: `/background/OC3_background.png`
- Set on root div in `App.tsx`

---

## Build & Development

### Scripts

**package.json**:

```json
{
  "scripts": {
    "dev": "vite",                    // Dev server (port 5173)
    "build": "tsc -b && vite build", // Type check + bundle
    "lint": "eslint .",               // ESLint check
    "preview": "vite preview"         // Preview production build
  }
}
```

---

### Configuration

**vite.config.ts**:
```typescript
export default defineConfig({
  plugins: [react()],  // @vitejs/plugin-react-swc
  resolve: {
    alias: {
      '@': '/src/',
    },
  },
});
```

**tsconfig.json**:
- Target: ES2022
- Module: ESNext
- JSX: react-jsx
- Strict: true
- Path mapping: `@/*` → `src/*`

---

## Key Patterns

### 1. Render Props

`AQuestionBoard` accepts `children` as render prop for flexible controls:

```tsx
<AQuestionBoard controls="subjects" {...props}>
  {({ variant, count, boxStates, toggle }) => (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <button key={i} onClick={() => toggle(i)}>
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

// Async iterator processes queue
while (!closure) {
  if (messageQueue.length > 0) {
    const message = messageQueue.shift()!;
    setLastMessage(message);
  }
  await new Promise(resolve => setTimeout(resolve, 0));
}
```

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

Components split into `admin/` and `player/` subdirectories. Shared items go in `shared/` or top-level.

### Feature-Based Grouping

Related functionality grouped together:
- **Round-specific pages**: Separate files per round
- **Common hooks**: Single `hooks/` directory
- **Type definitions**: Grouped by domain (`player`, `question`)

### Reusability First

If a component could be used by both roles → place in `components/shared/`.

---

## Performance Considerations

| Aspect | Implementation |
|--------|----------------|
| **Bundle Size** | Tree-shaking via ES modules (Vite) |
| **Code Splitting** | Automatic via React.lazy() (future) |
| **WebSocket** | 3s reconnection delay prevents overload |
| **Message Draining** | Sequential processing without loss |
| **Tailwind** | Purge unused CSS in production |

---

## Future Enhancements

Potential improvements:

1. **State Management**: Zustand if global state grows
2. **Error Boundaries**: Wrap each page
3. **Unit Tests**: Jest/Vitest for hooks and utilities
4. **E2E Tests**: Cypress or Playwright
5. **API Versioning**: Add `/api/v1/` prefix
6. **i18n**: Vietnamese/English support
7. **Responsive Design**: Mobile-first breakpoints
8. **Accessibility**: Full WCAG compliance

---

## Related Documentation

- [API Reference](./API.md) - HTTP & WebSocket endpoints
- [Components](./COMPONENTS.md) - Component library
- [Backend API](../backend/README.md) - Backend endpoints
