# Next: player accounts (login-first), replacing the PIN door

**Status:** all 6 steps done. Steps 2–6 landed with this pass (uncommitted at the
moment of writing — see the per-step notes below); step 1 was `b093114`.
**Approved shape:** players register themselves (email + password they choose), verify
by email, log in, and "Vào trận" opens the match they are seated in. The operator
**enrolls a known email** instead of creating identities. **The PIN path is removed.**

Why self-registration and not "operator types the password": an operator-chosen
password is a password the operator knows. The desk has no business holding one.

---

## 1. DONE — backend account loop (`b093114`)

| Endpoint | Behaviour |
|---|---|
| `POST /gameplay/auth/register` | email + password (min 8) → argon2 hash, `emailVerified=false`, **no session** |
| `GET /gameplay/auth/verify?token=` | 24h JWT, purpose `verify` → `302 /login?verify=ok\|expired\|invalid` |
| `POST /gameplay/auth/login` | refused until verified; same answer for wrong password and unknown address |
| `GET /gameplay/me/match` | the seat they occupy (UPCOMING or LIVE) — what "Vào trận" opens |

Mail: `nodemailer`, configured by `SMTP_HOST`/`SMTP_FROM` (+ optional `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`). **Without SMTP the message is written to the backend log**,
so a dev box can finish the flow by reading the log. Nothing pretends to have sent.

---

## 2. DONE — Gameplay: `/register` and `/login`

- `apps/gameplay/src/pages/RegisterPage.tsx` — email, password, display name; on
  success show "kiểm tra email để xác thực" (the mail may not exist locally — say so
  when `SMTP_HOST` is unset? the API cannot know, so keep the wording neutral).
- `apps/gameplay/src/pages/LoginPage.tsx` — email + password; `?verify=ok|expired|invalid`
  banner; on success go to `?next=` or `/`.
- `lib/session.ts`: `useLogin`, `useRegister`, and `loginLink()`/`registerLink()`
  replace the Google-only `loginLink` (Google stays as a secondary link when
  `useAuthMethods().google`).
- Routes in `App.tsx` **outside** AppShell (like `/join` was) or inside — decide:
  inside keeps the navbar, which is where the player sees their name after login.
  **Decided: inside** — the door sits under the navbar it leads into.

**Done when:** a person can register, read the link from the backend log, verify, log
in, and see their name in the navbar. — covered by `tests/auth-pages.test.tsx`.

---

## 3. DONE — Navbar + "Vào trận" straight to the deck

- Signed out → `Đăng nhập` (and `Đăng ký`).
- Signed in → `[Name] [Vào trận]`. The button calls `GET /gameplay/me/match`:
  0 matches → say "chưa có trận"; 1 → navigate to `/s/:slug/matches/:id`;
  several → a small list to pick from (they are ordered newest first already).
- Remove the `Vào trận → /join?next=` link.

**Done when:** a signed-in seated player reaches their deck in one click, and a
signed-in unseated player is told why not. — covered by `tests/navbar.test.tsx`.

---

## 4. DONE — Roster: enroll by email

- `POST /portal/tournaments/:t/players/by-email { email }` — finds the PLAYER by
  address and enrolls; 404 with a clear message when nobody registered that address
  yet, 409 when already enrolled. Refuse an unverified account. **Decided:** a
  `@players.invalid` placeholder answers the same 404 (nobody registered it), and a
  disabled account answers 403.
- Thí sinh tab: "Thêm thí sinh" dialog gains a tab/choice — **Enroll an account
  (email)** beside the existing **Create a show-floor identity (name + optional email)**.
  Keep the second one: a contestant who never signs in still needs a seat.
  **Decided:** tabs; enroll-by-email is the default (the shape the plan approved).

**Done when:** the operator can seat a person who registered five minutes ago,
without knowing their password. — backend tests in `roster.routes.test.ts`, dialog
tests in `players-tab.test.tsx`.

---

## 5. DONE — Delete the PIN path

| Remove | Where |
|---|---|
| `/join` page, `pin-door.tsx` | gameplay |
| PIN field in the 401 gate (link to `/login` instead) | `player-gates.tsx` |
| `POST /gameplay/join/lookup`, `/join/claim` | `backend/src/modules/auth/join.ts` (whole module) |
| `joinCode` generation + `PIN xxxxxx` in the matches table | matches service + portal matches tab |
| `lobbyHintOf` copy that mentions the PIN | `lib/lobby-hint.ts` |

Keep `matchId`/seat claim semantics untouched — seats still reference a user id;
only the way a session is minted changes.

**Done when:** nothing in either app mentions a PIN, and the tests that covered the
join routes are deleted with them (not skipped). — `join.routes.test.ts` and
`join-page.test.tsx` are deleted; `/gameplay/auth/methods` now answers `{ google }`
only; `docs/schema.md` updated to match.

**Decided (risk 4):** the `join_code` column is **dropped** — migration
`0008_drop_join_code.sql` — rather than left dead. The dev fixture's players are
now real verified accounts (`fixture-player-N@example.com` / `fixture-pass-2026`)
so a dev can still get onto the deck.

---

## 6. DONE — Privacy policy

- New section: **account** (email, argon2 hash — never the password, verification
  mail, session cookie) and what deleting an account would mean (results stay: they
  are the record of the contest).
- Keep the existing camera/mic section; it is unchanged by accounts.
- The contact block is still a placeholder — a real address must be filled in before
  the page is published.
- **Not done, deliberately:** the contact block is untouched (still a placeholder —
  a real address must be filled in before the page is published).

---

## Risks and open points

1. **A new runtime dependency** (`nodemailer`, + `@types`). It is the only dependency
   added so far; veto it and the mailer falls back to log-only (verification then
   needs the operator to hand out the link).
2. **Verification is a real gate**: a registered-but-unverified account cannot log in,
   and an unverified account cannot be enrolled (step 4).
3. **Existing show-floor contestants keep working** exactly as today (seated,
   operator-driven) but have no account and no way to log in.
4. **Join codes become dead** in step 5 — existing matches carry one in the database;
   decide whether the column is dropped or simply stops being written/displayed.
5. **`?next=`** on the old join link is unused after a claim; the login page should
   honour it instead (step 2).
