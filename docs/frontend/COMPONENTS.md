# Components Documentation

This document provides comprehensive documentation for all React components in the OLYMPIA CUSTOM 3 frontend.

## Table of Contents

1. [Shared Components](#shared-components)
2. [Admin Components](#admin-components)
3. [Player Components](#player-components)
4. [Component Patterns](#component-patterns)

---

## Shared Components

Reusable components used across both admin and player interfaces.

### InputField

**Location:** `src/components/shared/InputField.tsx`

**Purpose:** Lightweight form input wrapper with label and Tailwind styling.

**Props:**
- `label` (string): Label text displayed above input
- Standard HTML input attributes spread to underlying input element

**Usage:**
```tsx
<InputField
  label="Username"
  name="username"
  value={username}
  onChange={handleChange}
  placeholder="Enter username"
/>
```

**Styling:**
- Label: `block text-sm font-medium text-oc-text mb-1`
- Input: `w-full px-3 py-2 bg-white border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`

---

### RenderMedia

**Location:** `src/components/shared/RenderMedia.tsx`

**Purpose:** Conditional media renderer supporting images and videos.

**Props:**
- `src` (string): URL/path to media file
- `alt` (string): Alt text for accessibility (images only)
- `className` (string): Additional CSS classes

**Supported Media Types:**
- **Images:** `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- **Videos:** `.mp4`, `.webm`, `.ogg`
- **Unsupported:** Returns `null`

**Usage:**
```tsx
<RenderMedia src={questionMediaUrl} alt="Question image" className="w-full h-64 object-contain" />
```

**Implementation:**
```typescript
const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const videoExtensions = ['mp4', 'webm', 'ogg'];

const extension = src.split('.').pop()?.toLowerCase();
```

---

### ErrorBoundary

**Location:** `src/components/shared/ErrorBoundary.tsx`

**Purpose:** Class-based error boundary to catch and display errors gracefully.

**Props:**
- `children` (ReactNode): Content to render

**State:**
- `hasError` (boolean): Error flag
- `error` (Error): Error object

**Behavior:**
- Catches rendering errors in child component tree
- Logs errors to configured logger utility
- Displays Vietnamese error message: "Đã xảy ra lỗi. Vui lòng thử lại sau."
- Shows error details in development mode

**Usage:**
```tsx
<ErrorBoundary>
  <SomeComponent />
</ErrorBoundary>
```

---

### PingIconStyle

**Location:** `src/components/shared/PingIconStyle.tsx`

**Purpose:** Icon switcher displaying Zap (neutral) or KeyRound (keyword) icons.

**Props:**
- `isKeywordMode` (boolean): When true, shows KeyRound icon; otherwise Zap

**Styling:**
- Fixed size: `w-[18px] h-[18px]`
- Color: `text-gray-400`

**Usage:**
```tsx
<PingIconStyle isKeywordMode={false} />
```

---

## Admin Components

Components exclusive to the admin interface.

### AQuestionBoard

**Location:** `src/components/admin/AQuestionBoard.tsx`

**Purpose:** Main question display for admin with controls toggle functionality.

**Props:**
- `title` (string): Section title (e.g., "Câu hỏi 1")
- `question` (Question): Question object with text, answer, explanation, media
- `timerDuration` (number): Countdown duration in seconds
- `controls` ("numbers" | "subjects"): Control variant type
  - `"numbers"`: 6 numbered boxes for traditional buzzer rounds
  - `"subjects"`: Larger rectangles displaying scores for Vượt Đèo round
- `children`? (ReactNode): Render-prop for custom controls (see AdminQuestionBoardControls)
- `className`? (string): Additional styling

**Type Definitions:**
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
  onToggle?: (index: number, state: boolean) => void; // For subjects mode
}
```

**Layout:**
- Fixed height container (`h-[60vh]`) with scrolling explanation
- Question media displayed 50/50 split with question text
- Answer displayed when `showAnswers` is true
- Explanation scrollable in dedicated area
- Children (controls) rendered below question

**Usage Example:**
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
  onUpdateBoxState={(index, state) => setBoxStates(prev => prev.map((b, i) => i === index ? state : b))}
>
  {/* Custom controls can be passed as children */}
</AQuestionBoard>
```

**Styling:**
- Background: `bg-gray-200`
- Border: `border-4 border-gray-500`
- Text colors: Blue-900 for questions, green-600 for answers

---

### APlayerBar

**Location:** `src/components/admin/APlayerBar.tsx`

**Purpose:** Player status display showing connection, name, score, and buzzer state.

**Props:**
- `player` (PlayerStatus): Player data object
- `isActive` (boolean): Whether this player is currently answering
- `isCurrent` (boolean): Whether this is the current responder/focus
- `isKeywordMode` (boolean): Display keyword icon vs neutral icon
- `onClick`? (() => void): Click handler for selecting player
- `disabled`? (boolean): Disable interaction

**Display Elements:**
- Connection indicator (green dot if connected, gray if not)
- Player name (formatted from `playerName`)
- Timestamp (relative time: "Vừa xong", "3 giây trước")
- Last answer (truncated with `limitWords`)
- Score (in badge: `bg-blue-600`)
- Buzzed indicator (border color change: `border-blue-500`)
- PingIconStyle component (Zap or KeyRound)

**Interactions:**
- Click: Calls `onClick` with player code
- Keyboard: Enter/Space triggers click (accessible)
- Visual feedback:
  - `isCurrent && !isActive`: White border
  - `isActive`: Blue-500 border
  - Default: Blue-600 border

**Usage:**
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

**Location:** `src/components/admin/AVuotDeoClue.tsx`

**Purpose:** Clue/hint component for Vượt Đèo round with state management.

**Props:**
- `question` (Question): Question object to display clue for
- `index` (number): Player index for id generation
- `onClick` (() => Promise<'correct' | 'incorrect' | boolean>): Async callback returning result

**States:**
- `Idle`: Default state, clickable
- `Selected`: Loading state during async operation
- `Correct`: Green background, shows explanation modal with media
- `Incorrect`: Black background, returns to idle after delay

**Behavior:**
1. Click → enters Selected state
2. Call `onClick()` → waits for result
3. If `'correct'` or `true`: show explanation modal (press OK to dismiss)
4. If `'incorrect'` or `false`: 1.5s delay then return to Idle
5. Auto-cleanup modal on unmount

**Usage:**
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

## Player Components

Components exclusive to the player interface.

### PQuestionBoard

**Location:** `src/components/player/PQuestionBoard.tsx`

**Purpose:** Read-only question display for players.

**Props:**
- `title` (string): Section title
- `question` (Question): Question object
- `timerDuration` (number): Countdown duration
- `controls` (object): Display-only controls (no callbacks)
  - Shape matches AdminQuestionBoardControls but without `onToggle`
- `children`? (ReactNode): Optional child components
- `className`? (string): Additional styling

**Key Differences from AQuestionBoard:**
- Smaller height (`40vh` instead of `60vh`)
- Controls are display-only (cannot toggle answers)
- No answer toggling functionality
- Limited to read-only presentation

**Usage:**
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

**Location:** `src/components/player/PAnswerBox.tsx`

**Purpose:** Text input for player answers with Submit on Enter.

**Props:**
- `answer` (string): Current answer text
- `setAnswer` (Dispatch<SetStateAction<string>>): Setter for answer state
- `isDisabled` (boolean): Disable input during certain states
- `onSubmit` (() => void): Submit handler (called on Enter)
- `placeholderString` (string): Placeholder text

**Keyboard Handling:**
- Enter → trigger `onSubmit` (unless composing IME)
- Checks `isComposing` to avoid premature submission with Vietnamese IME

**Styling:**
- Border: `border-2 border-blue-900`
- Background: `bg-white` (enabled) / `bg-blue-900` (disabled)
- Transition: `transition-colors`

**Usage:**
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

**Location:** `src/components/player/PSubmitButton.tsx`

**Purpose:** Buzzer/submit button with visual state feedback.

**Props:**
- `isEnabled` (boolean): Enable/disable button
- `isKeywordMode` (boolean): Display different icon
- `label` (string): Button text (default: "BẤM CHUÔNG ĐỂ GIÀNH QUYỀN TRẢ LỜI")
- `onSubmit` (() => void): Click handler

**States:**
- **Enabled:** `bg-blue-300` ring, PingIconStyle Zap icon
- **Disabled:** `bg-blue-600` ring, no icon (or KeyRound if keyword mode)

**Styling:**
- Ring: `ring-2 ring-blue-300` (enabled) / `ring-blue-600` (disabled)
- Text: Bold, centered
- Icon: `w-6 h-6` (when enabled)
- Hover: `hover:bg-blue-200` (enabled only)

**Usage:**
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

**Location:** `src/components/player/PVuotDeoClue.tsx`

**Purpose:** Player version of the clue component for Vượt Đèo round.

**Props:**
- `question` (Question): Question with clue to display
- `index` (number): Unique identifier
- `onClick` (() => Promise<boolean>): Async callback (true=correct, false=incorrect)

**States:** Same as admin version (Idle, Selected, Correct, Incorrect)

**Behavior:**
- On correct: 5-second delay before closed automatically
- Shows explanation popup when correct
- Identical state machine to AVuotDeoClue

**Usage:** Same as AVuotDeoClue

---

### PPlayerRec

**Location:** `src/components/player/PPlayerRec.tsx`

**Purpose:** Player record card displaying individual player info in list.

**Props:**
- `player` (PlayerStatus): Player data
- `isCurrent` (boolean): Highlight current player

**Content:**
- Player name (bold)
- Score badge (blue background)
- Last answer (truncated, shown if exists)
- Timestamp (if available)
- Bell icon (if player has buzzed)

**Styling:**
- Default: `bg-blue-100`
- Current player: `bg-blue-600` with `scale-105` transform
- Rounded corners, padding

**Usage in player lists:**
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

### Controlled Components

All input components follow React controlled patterns:
- Parent owns state via `useState`
- Value passed via `value` prop
- Updates via setter function prop (`setValue` or `onChange`)

### Accessibility

- ARIA attributes: `aria-disabled`, `aria-label`
- Keyboard support: Enter/Space on interactive elements
- Semantic HTML: `<button>`, `<input>`, `<dialog>`

### Styling Strategy

- **Tailwind CSS:** All styling via utility classes
- **Color Palette:**
  - Primary: `blue-900`, `blue-600`, `blue-300`
  - Success: `green-500`, `green-600`
  - Danger: `red-500`, `black` (for incorrect)
  - Neutral: `gray-200`, `gray-400`, `gray-600`
- **Consistent spacing:** `p-3`, `m-2`, `gap-4`
- **Border radius:** `rounded-lg`, `rounded-md`

### Media Handling

- **RenderMedia:** Centralized media rendering logic
- **File types:** Hardcoded extension checks (no MIME sniffing)
- **Fallback:** Returns `null` for unsupported types

### Error Handling

- **ErrorBoundary:** Global catch-all for component errors
- **Try-catch:** Used in async operations (Vượt Đèo clicks)
- **User feedback:** Alert dialogs for API failures

---

## Component File Naming Convention

- **Shared:** `PascalCase` (e.g., `InputField.tsx`)
- **Admin prefix:** `A<ComponentName>.tsx` (e.g., `APlayerBar.tsx`)
- **Player prefix:** `P<ComponentName>.tsx` (e.g., `PAnswerBox.tsx`)
- **Utilities:** `camelCase` (e.g., `limitWords` in `playerHelpers.ts`)

---

## Best Practices

1. **Props:** Keep props minimal, use render-props for flexibility
2. **State:** Lift state up; components should be as stateless as possible
3. **Styling:** Prefer Tailwind over custom CSS; consistent color tokens
4. **Icons:** Use Lucide React for consistent iconography
5. **Conditional rendering:** Use early returns or ternary operators
6. **Async operations:** Handle loading states and errors
7. **Cleanup:** Use `useEffect` return functions for unmount cleanup

---

## Creating New Components

When adding a new component:

1. Place in appropriate folder: `components/shared/`, `admin/`, or `player/`
2. Follow naming convention with prefix
3. Export as default or named
4. Add PropTypes or TypeScript interface for props
5. Include JSDoc comments for complex props
6. Keep component focused on single responsibility
7. Use existing utility functions from `src/utils/`

---

## Common Utilities Used in Components

- **logger** (`src/utils/logger.ts`): Debug logging
- **playerHelpers** (`src/utils/playerHelpers.ts`): `limitWords`, `buildPlayersSnapshot`
- **useQuestionState** (`src/hooks/useQuestionState.ts`): Question state management
- **useCountdownTimer** (`src/hooks/useCountdownTimer.ts`): Timer logic
- **usePlayerWebSocket / useAdminWebSocket**: Context consumers
