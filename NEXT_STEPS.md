# Player accounts (login-first) — replacing the PIN door

**Status: all seven steps are DONE.** Step 1 = `b093114`, steps 2–6 = `8729b9e`,
step 7 (room codes) = `22abc99` — the build recorded at the bottom of this file.
The approved shape, as built: players register themselves (email + password they
choose), verify by email, log in, and "Vào trận" opens the match they are seated
in. The operator **enrolls a known email** instead of creating identities. **The
PIN path is removed**, and what came back in step 7 is a ROOM CODE that says
which room is open — never who the player is.

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
  **AMENDED BY STEP 7 (decision 4 below):** the unverified refusal is GONE — an
  unverified address is enrolled, landing in the roster with «Xác thực» beside it,
  because refusing it here kept the account out of the only place that button is.
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
2. **Verification is a real gate**: a registered-but-unverified account cannot log in.
   (Originally also "an unverified account cannot be enrolled (step 4)" — **step 7
   removed that half**: enrollment no longer refuses an unverified address, because
   the refusal kept the account out of the roster where step 7's «Xác thực» button
   lives. Login still refuses until somebody clicks it.)
3. **Existing show-floor contestants keep working** exactly as today (seated,
   operator-driven) but have no account and no way to log in.
4. **Join codes become dead** in step 5 — existing matches carry one in the database;
   decided: the column is **dropped** (`0008_drop_join_code.sql`). Superseded in
   shape by step 7, which brings codes back as an expiring `match_codes` table.
5. **`?next=`** on the old join link is unused after a claim; the login page should
   honour it instead (step 2).

---

## 7. DONE — Room codes: the PIN returns, demoted

**The decision:** `mail + password (chosen by the player) + PIN` — NOT
`playername + PIN`. Identity picked at the door is unrepairable once answers are on
the record (the stats-splitting bug), so the player's name is never typed in.
The two secrets are split by what they answer:

| | Mail + password | Room code (PIN) |
|---|---|---|
| Answers | **Who you are** — stats, history, the seat row | **Which room is open** |
| Held by | The player, forever | The operator, rotatable |
| Grants | The session | Entry to one match, once seated |

**The rule: the code says which room, the account says who you are.** A claim needs
BOTH — an authenticated session AND the code. Identity is never chosen at the door;
a player the desk never pre-seated still walks straight in.

This inverts the deleted claim (`join.ts`): the old one minted a session FROM the
code (code = identity — why it was deleted in step 5); this one REQUIRES a session
and uses the code only for entry (account = identity, code = room). `matchId`/seat
semantics stay untouched — seats keep referencing `user.id`.

### The five decisions

1. **Instant seat if room.** Logged-in + valid code + a free seat → seated on the
   spot. Capacity is the real check: a match holds 3–4 (the format check must reject
   a full table). The console shows who claimed and can eject them. The code IS the
   permission — no approval queue.
2. **Walk-in with no account:** they register at the venue, then the **operator
   clicks "verify" in the roster** — the desk can see the account exists, so SMTP
   stays optional on the floor. Mail links remain a convenience, not a gate.
3. **Forgotten password:** the operator issues a **one-time entry code bound to
   that player's seat/account** — the desk NEVER holds a password. This preserves
   the plan's principle ("a password the operator knows is a password the operator
   knows"). Not a temp password.
4. **The account stays the only identity.** `GET /gameplay/me/match`, enroll-by-email
   and the navbar's one-click `Vào trận` all keep working unchanged.
5. **Codes are rotatable and expiring** — leaked code → mint a new one; seats and
   accounts untouched.

### What was built

- **Schema:** `match_codes` (migration `0009_match_codes.sql`) — code, `matchId`,
  `userId`, `expiresAt`, `usedAt?`, `createdBy`, with a CHECK that a row names
  EXACTLY ONE target: a match is a ROOM code, a user is an ENTRY code. The
  dropped `join_code` (0008) stays dropped; a standing column cannot expire.
- **`POST /gameplay/join/claim { code }`** — authenticated: session + code + a
  free seat → a seat for the session's own userId, in one transaction behind
  `FOR UPDATE` (two walk-ins for the last seat cannot both win). 401 without a
  session, 404 unknown/expired code (an entry code answers the same 404), 409 a
  full table or a finished match. Re-claiming while already seated is a no-op.
  Capacity = the largest `allowedSeatCounts` seat count of the format.
- **`POST /gameplay/auth/entry-code { code }`** — the password-reset path:
  single use (a conditional UPDATE consumes it), 15 minutes, and it mints the
  SAME GAMEPLAY cookie a password login does (the player's own tokenVersion).
- **Roster (portal):** `POST …/players/:userId/verify` (activate — set
  `emailVerified`, refused for a show-floor identity and a disabled account,
  audited) and `POST …/players/:userId/entry-code` (issue, refused until the
  account is activated, audited **without the value**). `listEnrolled` now
  returns `emailVerified`, which is what the button reads.
- **Console:** `GET …/match-codes` (all live codes of the tournament) and
  `POST …/matches/:m/code` (mint or ROTATE — the new row is written first, then
  the old ones are deleted in the same transaction). Both write-guarded: a code
  seats people, and `canViewTournament` says yes to every staff member on a
  PUBLIC tournament. Plus `DELETE …/matches/:m/players/:userId` — **eject**, the
  seat-level undo decision 1 asks for (UPCOMING only; it deliberately bypasses
  `updateMatch`'s whole-array format check, which still runs at the LIVE
  transition and says what is missing).
- **Gameplay UI:** `/code` — the code box. Signed out it is a gate to
  `/login?next=%2Fcode` (the round trip the plan asks for); signed in it claims
  and lands on `/s/:slug/matches/:id`. The navbar gains a secondary **Nhập mã**
  beside the one-click **Vào trận** (signed out → `/login?next=%2Fcode`). The
  login page gains **«Quên mật khẩu? Dùng mã một lần do ban điều hành cấp»** —
  a second door in the same card, never a second form.
- **Portal UI:** the roster row gains **Xác thực** (only while unverified) and
  **Mã vào** (only where there is an account), the code shown ONCE in a banner
  with its clock and dismissible; the matches tab shows `Mã XXXXXX` + **Xoay**/
  **Tạo mã** where `PIN xxxxxx` used to be, and each UPCOMING seat gets an ×.

**Decisions taken while building** (all in the plan's shape):

1. **Claim checks no roster** — decision 1 says the code IS the permission and
   decision 2's walk-in is already enrolled by the desk to reach «Xác thực».
   The seat, not the roster, is what `GET /gameplay/me/match` reads.
2. **An entry code needs an activated account** — «Xác thực» is refused first
   for an unverified one, so the two roster actions compose in that order.
3. **Audit reuses `tournament_updated`** with `seatClaimed`, `roomCodeRotated`,
   `activated` and `entryCodeFor` in `details` — a code VALUE is never written.
4. **Enroll-by-email stopped refusing unverified addresses** (step 4's 403 is
   SUPERSEDED by decision 2). On a floor without SMTP the player may never open
   the link, so the refusal kept the account OUT of the roster — which is where
   decision 2's «Xác thực» button lives: never enrolled → never verified → dead
   end. The row now lands unverified with the button one click away; a disabled
   account still 403s, unknown still 404s, already enrolled still 409s. Step 4's
   test was rewritten to say so, and the enroll dialog's copy no longer demands
   the link first.

**Also fixed while building:** `scripts/dev-fixture.ts` still wrote
`joinCode: JOIN_CODE` after step 5 deleted the constant — a ReferenceError that
made the fixture unrunnable, against a column `0008` had dropped. It now seats
three of its four players and mints a ROOM CODE per run, so a dev can log in as
the fourth and walk the whole claim flow on localhost.

**Done when (met):** a player who registered five minutes ago and a player with
no pre-assigned seat both reach the deck by typing a code the desk can rotate at
any time — and no surface anywhere lets anyone pick their own name at the door.

**Tests:** `match-codes.routes.test.ts` (claim session/capacity/expiry/rotation,
entry-code single use, eject, both audits) · roster +12 (activate, issue, guards)
· `code-page.test.tsx` · navbar +2 · auth-pages +4 (the entry-code door) ·
players-tab +5 · `matches-tab.test.tsx` (show/rotate/eject/403). The old
`join.routes.test.ts` was NOT resurrected — its shape was wrong (a pre-session
claim).

### Risks (step 7) — as they stand after the build

1. **The code is a bearer secret again** — anyone holding it + an account gets a
   seat. Accepted for a show floor (the desk watches and can eject), which is why
   rotation and expiry are mandatory rather than nice-to-have.
   *Addressed:* 24 h room codes, rotation deletes the old value in the same
   transaction, and the matches tab can eject a wrongly seated player.
2. **Capacity races:** two walk-ins claiming the last seat at the same moment — the
   seat upsert must be atomic (one wins, the other gets 409).
   *Addressed:* the claim runs in a transaction behind `SELECT … FOR UPDATE` on the
   match; the loser sees the full table and gets the same 409 a sequential caller
   would (`match-codes.routes.test.ts` asserts the seat list never grows past the
   winner's write).
3. **`verify` in the roster is a trust action:** the operator vouches for the
   address. It should be audited (the audit log already records roster writes).
   *Addressed:* audited as `tournament_updated` with `details.activated` +
   `targetId`, asserted in `roster.routes.test.ts`.
4. **One-time codes are also bearer secrets**, but bound to a user and single-use —
   strictly narrower than the old standing PIN.
   *Addressed:* consumed by a conditional UPDATE (one winner), 15-minute life,
   replaced on re-issue, and never written to the audit trail.
