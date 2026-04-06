# Component Library Documentation

Comprehensive documentation for all React components in the OLYMPIA CUSTOM 3 frontend.

---

## Table of Contents

1. [Shared Components](#shared-components)
2. [Admin Components](#admin-components)
3. [Player Components](#player-components)
4. [Component Patterns](#component-patterns)
5. [Best Practices](#best-practices)

---

## Shared Components

Reusable components used across both admin and player interfaces.

### InputField

**Location**: `src/components/shared/InputField.tsx`

**Purpose**: Lightweight form input wrapper with label and Tailwind styling.

**Props**:
```typescript
interface InputFieldProps {
  label: string;
  name?: string;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  required?: boolean;
}
```

**Usage**:
```tsx
<InputField
  label="Username"
  name="username"
  value={username}
  onChange={handleChange}
  placeholder="Enter username"
/>
```

**Styling**:
- Label: `block text-sm font-medium text-oc-text mb-1`
- Input: `w-full px-3 py-2 bg-white border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`

---

### RenderMedia

**Location**: `src/components/shared/RenderMedia.tsx`

**Purpose**: Conditional media renderer supporting images and videos.

**Props**:
```typescript
interface RenderMediaProps {
  src: string;
  alt?: string;
  className?: string;
}
```

**Supported Media Types**:
- **Images**: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- **Videos**: `.mp4`, `.webm`, `.ogg`
- **Unsupported**: Returns `null`

**Usage**:
```tsx
<RenderMedia 
  src={questionMediaUrl} 
  alt="Question image" 
  className="w-full h-64 object-contain" 
/>
```

**Implementation**:
```typescript
const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const videoExtensions = ['mp4', 'webm', 'ogg'];

const extension = src.split('.').pop()?.toLowerCase();

if (imageExtensions.includes(extension)) {
  return <img src={src} alt={alt} className={className} />;
} else if (videoExtensions.includes(extension)) {
  return <video src={src} className={className} controls />;
}
return null;
```

---

### ErrorBoundary

**Location**: `src/components/shared/ErrorBoundary.tsx`

**Purpose**: Class-based error boundary to catch and display errors gracefully.

**Props**:
```typescript
interface ErrorBoundaryProps {
  children: ReactNode;
}
```

**State**:
- `hasError`: boolean
- `error`: Error | null

**Behavior**:
- Catches rendering errors in child component tree
- Logs errors to configured logger
- Displays Vietnamese error message: "Đã xảy ra lỗi. Vui lòng thử lại sau."
- Shows error details in development mode

**Usage**:
```tsx
<ErrorBoundary>
  <SomeComponent />
</ErrorBoundary>
```

---

### PingIconStyle

**Location**: `src/components/shared/PingIconStyle.tsx`

**Purpose**: Icon switcher displaying Zap (neutral) or KeyRound (keyword) icons.

**Props**:
```typescript
interface PingIconStyleProps {
  isKeywordMode: boolean;
}
```

**Styling**:
- Fixed size: `w-[18px] h-[18px]`
- Color: `text-gray-400`

**Usage**:
```tsx
<PingIconStyle isKeywordMode={false} />
```

---

### VeDichQuestionCard

**Location**: `src/components/shared/VeDichQuestionCard.tsx`

**Purpose**: Question card component for the Final Stage (Về Đích) rounds.

**Props**:
```typescript
interface VeDichQuestionCardProps {
  question: Question;
  isLocked: boolean;
  onSubmit: (answer: string) => void;
  timerDuration?: number;
}
```

**Features**:
- Displays question with media support via `RenderMedia`
- Lock/unlock state for answer submission control
- Integrated timer display (optional)
- Answer input with submit button
- Visual feedback for locked/unlocked states

**Usage**:
```tsx
<VeDichQuestionCard
  question={currentQuestion}
  isLocked={isAnswerLocked}
  onSubmit={handleSubmitAnswer}
  timerDuration={30}
/>
```

---

## Admin Components

Components exclusive to the admin interface.

### AQuestionBoard

**Location**: `src/components/admin/AQuestionBoard.tsx`

**Purpose**: Main question display for admin with controls toggle functionality.

**Props**:
```typescript
interface AQuestionBoardProps {
  title: string;
  question: Question;
  timerDuration: number;
  controls: "numbers" | "subjects";
  showAnswers: boolean;
  onToggleAnswers: () => void;
  currentIndex: number;
  count: number;
  boxStates: boolean[];
  onUpdateBoxState?: (index: number, state: boolean) => void;
  onToggle?: (index: number, state: boolean) => void;  // For subjects mode
  children?: ReactNode;
  className?: string;
}
```

**Type Definitions**:
```typescript
type BaseQuestionBoardControls = {
  showAnswers: boolean;
  onToggleAnswers: () => void;
  currentIndex: number;
  count: number;
  boxStates: boolean[];
  onUpdateBoxState?: (index: number, state: boolean) => void;
};

interface AdminQuestionBoardControls extends BaseQuestionBoardControls {
  onToggle?: (index: number, state: boolean) => void;
}
```

**Layout**:
- Fixed height container (`h-[60vh]`) with scrolling explanation
- Question media displayed 50/50 split with question text
- Answer displayed when `showAnswers` is true
- Explanation scrollable in dedicated area
- Children (controls) rendered below question

**Usage Example**:
```tsx
<AQuestionBoard
  title="Câu hỏi 1"
  question={currentQuestion}
  timerDuration={30}
  controls="numbers"
  showAnswers={showAnswers}
  onToggleAnswers={() => setShowAnswers(!showAnswers)}
  currentIndex={currentQuestionIndex}
  count={totalQuestions}
  boxStates={boxStates}
  onUpdateBoxState={(index, state) => 
    setBoxStates(prev => prev.map((b, i) => i === index ? state : b))
  }
>
  {/* Custom controls can be passed as children */}
</AQuestionBoard>
```

**Styling**:
- Background: `bg-gray-200`
- Border: `border-4 border-gray-500`
- Text colors: Blue-900 for questions, green-600 for answers

---

### APlayerBar

**Location**: `src/components/admin/APlayerBar.tsx`

**Purpose**: Player status display showing connection, name, score, and buzzer state.

**Props**:
```typescript
interface APlayerBarProps {
  player: PlayerStatus;
  isActive: boolean;
  isCurrent: boolean;
  isKeywordMode: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

// PlayerStatus now includes optional qualifier tie-breaker fields:
interface PlayerStatus {
  playerCode: string;
  playerName: string;
  playerScore: number;
  playerLastAnswer?: string;
  playerTimestamp?: number;
  playerHasBuzzed?: boolean;
  playerConnected?: boolean;
  playerIsTurn?: boolean;
  // Qualifier-specific (optional)
  playerCorrectScore?: number;
  playerAvgResponseTime?: number;
}
```

**Display Elements**:
- Connection indicator (green dot if connected, gray if not)
- Player name (formatted from `playerName`)
- Timestamp (relative time: "Vừa xong", "3 giây trước")
- Last answer (truncated with `limitWords`)
- Score (in badge: `bg-blue-600`)
- Buzzed indicator (border color change: `border-blue-500`)
- PingIconStyle component (Zap or KeyRound)
- **Qualifier Tie-Breaker Info** (only in AQualifierPage):
  - `playerCorrectScore`: Points from correct answers only
  - `playerAvgResponseTime`: Average response time in seconds
  - Displayed as: "Đúng: X điểm | T.Bình: Ys"

---

### AQualifierPage

**Location**: `src/pages/admin/AQualifierPage.tsx`

**Purpose**: Admin control panel for the Qualifier round (Vòng Loại).

**Features**:
- Round selector (dropdown for rounds 1-5)
- Question navigation (8/4/2/2/8 questions per round)
- Answer grid (A-F options with visual feedback)
- Control buttons: Start Round, Timer, Show Answer, Calculate Score, End Round
- Player standings sidebar (grouped by round, passed/reserve status)
- WebSocket integration for real-time updates

**State Management**:
- `currentRound`: Active round number (1-5)
- `currentQuestionIndex`: Question index within round
- `currentQuestion`: Question object with text, options, answer
- `standings`: Player rankings sorted by score
- `advancements`: Passed/reserve status per player per round

**Key Functions**:
- `resolveQuestionCode(round, idx)`: Generate question code `OC3_Q_VL_{round}_{idx:02d}`
- `parseOptions(options)`: Parse JSON options string to array
- `handleCalculateScore()`: Call `POST /qualifier/calculate-scores`
- `handleEndRound()`: Call `POST /qualifier/end-round`

**WebSocket Events Sent**:
- `send_question`: Broadcast question to players
- `start_the_timer`: Start countdown
- `sync_qualifier_round`: Sync round state

**WebSocket Events Received**:
- `qualifier_scores_updated`: Score calculation results
- `qualifier_advancement`: Round advancement results

**Usage**:
```tsx
// Route: /admin/vl
// Access: Admin role required
<AQualifierPage />
```

**Interactions**:
- Click: Calls `onClick` with player code
- Keyboard: Enter/Space triggers click (accessible)
- Visual feedback:
  - `isCurrent && !isActive`: White border
  - `isActive`: Blue-500 border
  - Default: Blue-600 border

**Usage**:
```tsx
<APlayerBar
  player={playerData}
  isActive={buzzedPlayerCode === playerData.playerCode}
  isCurrent={currentPlayerCode === playerData.playerCode}
  isKeywordMode={false}
  onClick={() => selectPlayer(playerData.playerCode)}
  disabled={false}
/>
```

---

### AVuotDeoClue

**Location**: `src/components/admin/AVuotDeoClue.tsx`

**Purpose**: Clue/hint component for Vượt Đèo round with state management.

**Props**:
```typescript
interface AVuotDeoClueProps {
  question: Question;
  index: number;
  onClick: () => Promise<'correct' | 'incorrect' | boolean>;
}
```

**States**:
- `Idle`: Default state, clickable
- `Selected`: Loading state during async operation
- `Correct`: Green background, shows explanation modal with media
- `Incorrect`: Black background, returns to idle after delay

**Behavior**:
1. Click → enters Selected state
2. Call `onClick()` → waits for result
3. If `'correct'` or `true`: show explanation modal (press OK to dismiss)
4. If `'incorrect'` or `false`: 1.5s delay then return to Idle
5. Auto-cleanup modal on unmount

**Usage**:
```tsx
<AVuotDeoClue
  question={vuotDeoQuestion}
  index={playerIndex}
  onClick={async () => {
    const result = await checkAnswer(playerCode, vuotDeoQuestion.questionAnswer);
    if (result) awardPoints(playerCode, 10);
    return result ? 'correct' : 'incorrect';
  }}
/>
```

---

### AControlButton

**Location**: `src/components/admin/AControlButton.tsx`

**Purpose**: Control button component for admin game management actions.

**Props**:
```typescript
interface AControlButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  icon?: ReactNode;
}
```

**Variants**:
- **Primary**: Main action buttons (blue theme)
- **Secondary**: Secondary actions (gray theme)
- **Danger**: Destructive actions (red theme)

**Features**:
- Optional icon support
- Disabled state styling
- Click handler with loading state support

**Usage**:
```tsx
<AControlButton
  label="Start Game"
  onClick={handleStartGame}
  disabled={!isReady}
  variant="primary"
/>
```

---

## Player Components

Components exclusive to the player interface.

### PQuestionBoard

**Location**: `src/components/player/PQuestionBoard.tsx`

**Purpose**: Read-only question display for players.

**Props**:
```typescript
interface PQuestionBoardProps {
  title: string;
  question: Question;
  timerDuration: number;
  controls: object;  // Display-only controls
  children?: ReactNode;
  className?: string;
}
```

**Key Differences from AQuestionBoard**:
- Smaller height (`40vh` instead of `60vh`)
- Controls are display-only (cannot toggle answers)
- No answer toggling functionality
- Limited to read-only presentation

**Usage**:
```tsx
<PQuestionBoard
  title="Câu hỏi chung"
  question={currentQuestion}
  timerDuration={30}
  controls={playerControls}
>
  <PAnswerBox ... />
  <PSubmitButton ... />
</PQuestionBoard>
```

---

### PAnswerBox

**Location**: `src/components/player/PAnswerBox.tsx`

**Purpose**: Text input for player answers with Submit on Enter.

**Props**:
```typescript
interface PAnswerBoxProps {
  answer: string;
  setAnswer: Dispatch<SetStateAction<string>>;
  isDisabled: boolean;
  onSubmit: () => void;
  placeholderString: string;
}
```

**Keyboard Handling**:
- Enter → trigger `onSubmit` (unless composing IME)
- Checks `isComposing` to avoid premature submission with Vietnamese IME

**Styling**:
- Border: `border-2 border-blue-900`
- Background: `bg-white` (enabled) / `bg-blue-900` (disabled)
- Transition: `transition-colors`

**Usage**:
```tsx
<PAnswerBox
  answer={answerText}
  setAnswer={setAnswerText}
  isDisabled={isAnswerLocked}
  onSubmit={handleSubmitAnswer}
  placeholderString="Nhập câu trả lời..."
/>
```

---

### PSubmitButton

**Location**: `src/components/player/PSubmitButton.tsx`

**Purpose**: Buzzer/submit button with visual state feedback.

**Props**:
```typescript
interface PSubmitButtonProps {
  isEnabled: boolean;
  isKeywordMode: boolean;
  label?: string;
  onSubmit: () => void;
}
```

**States**:
- **Enabled:** `bg-blue-300` ring, PingIconStyle Zap icon
- **Disabled:** `bg-blue-600` ring, no icon (or KeyRound if keyword mode)

**Styling**:
- Ring: `ring-2 ring-blue-300` (enabled) / `ring-blue-600` (disabled)
- Text: Bold, centered
- Icon: `w-6 h-6` (when enabled)
- Hover: `hover:bg-blue-200` (enabled only)

**Usage**:
```tsx
<PSubmitButton
  isEnabled={canBuzz}
  isKeywordMode={false}
  label="BẤM CHUÔNG"
  onSubmit={handleBuzz}
/>
```

---

### PVuotDeoClue

**Location**: `src/components/player/PVuotDeoClue.tsx`

**Purpose**: Player version of the clue component for Vượt Đèo round.

**Props**:
```typescript
interface PVuotDeoClueProps {
  question: Question;
  index: number;
  onClick: () => Promise<boolean>;
}
```

**States**: Same as admin version (Idle, Selected, Correct, Incorrect)

**Behavior**:
- On correct: 5-second delay before closed automatically
- Shows explanation popup when correct
- Identical state machine to AVuotDeoClue

**Usage**: Same as AVuotDeoClue

---

### PPlayerRec

**Location**: `src/components/player/PPlayerRec.tsx`

**Purpose**: Player record card displaying individual player info in list.

**Props**:
```typescript
interface PPlayerRecProps {
  player: PlayerStatus;
  isCurrent: boolean;
}
```

**Content**:
- Player name (bold)
- Score badge (blue background)
- Last answer (truncated, shown if exists)
- Timestamp (if available)
- Bell icon (if player has buzzed)

**Styling**:
- Default: `bg-blue-100`
- Current player: `bg-blue-600` with `scale-105` transform
- Rounded corners, padding

**Usage in player lists**:
```tsx
{PPlayerList.map(player => (
  <PPlayerRec
    key={player.playerCode}
    player={player}
    isCurrent={player.playerCode === myPlayerCode}
  />
))}
```

---

### PQualifierPage

**Location**: `src/pages/player/PQualifierPage.tsx`

**Purpose**: Player interface for the Qualifier round (Vòng Loại).

**Features**:
- Question display with 6 answer options (A-F)
- Countdown timer synced with admin
- Answer selection and submission
- Real-time score updates via WebSocket
- Personal standing display (rank, score)

**State Management**:
- `selectedOption`: Currently selected answer (A-F)
- `pendingOption`: Option clicked but not confirmed
- `showAnswers`: Whether correct answer is revealed
- `myStanding`: Current player's ranking info
- `answeredCount`: Number of players who submitted answers

**Key Functions**:
- `parseOptions(options)`: Parse JSON options string to array
- `handleOptionClick(option)`: Select answer option
- `handleSubmitAnswer()`: Submit answer via WebSocket

**WebSocket Events Sent**:
- `player_online`: Announce presence on connect
- `request_qualifier_state`: Request current round state
- `answer`: Submit answer for current question

**WebSocket Events Received**:
- `question`: Receive question from admin
- `start_the_timer`: Start countdown
- `qualifier_scores_updated`: Score calculation results
- `qualifier_advancement`: Round advancement results
- `clear_question`: Clear question display

**Usage**:
```tsx
// Route: /player/vl
// Access: Player role required
<PQualifierPage />
```

---

## Component Patterns

### Render-Prop Pattern

**AQuestionBoard** uses render-prop pattern for flexible control injection:

```tsx
<AQuestionBoard controls="subjects" {...props}>
  {({ variant, count, boxStates, toggle }) => (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          className={boxStates[i] ? 'bg-green-500' : 'bg-gray-300'}
          onClick={() => toggle(i)}
        >
          Player {i + 1}
        </button>
      ))}
    </div>
  )}
</AQuestionBoard>
```

---

### Controlled Components

All input components follow React controlled patterns:

```tsx
const [value, setValue] = useState("");

<InputField
  value={value}
  onChange={e => setValue(e.target.value)}
  // ...other props
/>
```

---

### Accessibility

- **ARIA attributes**: `aria-disabled`, `aria-label`
- **Keyboard support**: Enter/Space on interactive elements
- **Semantic HTML**: `<button>`, `<input>`, `<dialog>`

---

### Styling Strategy

- **Tailwind CSS**: All styling via utility classes
- **Color Palette**:
  - Primary: `blue-900`, `blue-600`, `blue-300`
  - Success: `green-500`, `green-600`
  - Danger: `red-500`, `black` (for incorrect)
  - Neutral: `gray-200`, `gray-400`, `gray-600`
- **Consistent spacing**: `p-3`, `m-2`, `gap-4`
- **Border radius**: `rounded-lg`, `rounded-md`

---

### Media Handling

- **RenderMedia**: Centralized media rendering logic
- **File types**: Hardcoded extension checks (no MIME sniffing)
- **Fallback**: Returns `null` for unsupported types

---

### Error Handling

- **ErrorBoundary**: Global catch-all for component errors
- **Try-catch**: Used in async operations (Vượt Đèo clicks)
- **User feedback**: Alert dialogs for API failures

---

## Best Practices

### Creating New Components

When adding a new component:

1. **Place in appropriate folder**:
   - `components/shared/` - Shared components
   - `components/admin/` - Admin-only components
   - `components/player/` - Player-only components

2. **Follow naming convention**:
   - Shared: `PascalCase` (e.g., `InputField.tsx`)
   - Admin prefix: `A<ComponentName>.tsx` (e.g., `APlayerBar.tsx`)
   - Player prefix: `P<ComponentName>.tsx` (e.g., `PAnswerBox.tsx`)

3. **TypeScript**:
   - Define props interface
   - Add JSDoc comments for complex props
   - Avoid `any` type

4. **Component structure**:
   - Keep focused on single responsibility
   - Use existing utility functions from `src/utils/`
   - Follow controlled component pattern

---

### Code Quality

- **Props**: Keep props minimal, use render-props for flexibility
- **State**: Lift state up; components should be as stateless as possible
- **Styling**: Prefer Tailwind over custom CSS; consistent color tokens
- **Icons**: Use Lucide React for consistent iconography
- **Conditional rendering**: Use early returns or ternary operators
- **Async operations**: Handle loading states and errors
- **Cleanup**: Use `useEffect` return functions for unmount cleanup

---

### Common Utilities

Components use these utilities from `src/utils/`:

| Utility | Purpose |
|---------|---------|
| `logger` | Debug logging |
| `limitWords` | Truncate text with word limit |
| `buildPlayersSnapshot` | Build player state snapshot |
| `useQuestionState` | Question state management |
| `useCountdownTimer` | Timer logic |
| `usePlayerWebSocket / useAdminWebSocket` | Context consumers |

---

## Related Documentation

- [API Reference](./API.md) - HTTP & WebSocket endpoints
- [Architecture](./ARCHITECTURE.md) - Frontend architecture overview
- [Backend API](../backend/README.md) - Backend endpoints
