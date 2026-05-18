# Hangmangle — Handoff for New Claude Code Session

You are picking up a project that was scoped out in a previous Claude Code session. This document is the full context. Read it, confirm the plan with the user, then start building.

---

## The game

Hangmangle is a two-team variant of Hangman invented ~20 years ago by two of the user's former students (Ania and Quazie). The board looks like traditional Hangman but with **two gallows** (one per team, left/right of the word slots).

**Setup:** Teams agree on a word length (usually 5–6). Each team privately thinks of a word of that length.

**Play:** Teams alternate guessing letters.
- If the guessed letter is in the other team's word, the other team places it in the correct slot(s) on the board.
- If not, the letter goes to an "eliminated" zone under the *guessing* team's gallows, and a body part is added to that team's hangperson.
- **Crucial twist:** Either team may change their secret word at any time, as long as the new word still fits the current board state (correct letters in correct positions, no eliminated letters). Strategy revolves around tracking all candidate words that still fit.

**Win conditions:**
1. **Guess Word** — On its turn, a team declares the other team's word. If the other team can produce a different valid word that fits, the other team wins. Otherwise the guesser wins.
2. **Call Bluff** — After the other team responds to a letter guess, a team can claim no word fits the board. If correct, they win. If the other team produces a valid word, the other team wins.
3. **Full hangperson** — All 8 body parts drawn. (Rare in practice.)

**The app does not handle guessing/answering itself** — that happens over voice (Zoom, etc.). The app facilitates board state, team-private strategy, and candidate-word tracking.

---

## Decisions already made (do not re-litigate)

### Architecture
- **Hosting:** Vercel, static site (no build step).
- **Backend:** Firebase — Firestore for state, Anonymous Auth for player identity. Chosen over Supabase because Firebase Spark (free) tier doesn't pause on inactivity.
- **No framework / no bundler.** Plain HTML/CSS/JS using Firebase JS SDK v10 via ES module CDN imports. Match the simple style of small static apps.
- **Repo:** New, empty repo at `/Users/digw/Documents/jkupp/AI/claude_code/hangmangle/` with a corresponding new GitHub repo. Files go at the repo root.

### Rooms & teams
- One team creates the game, gets a room code to share. No accounts.
- Multiple players per team, each on their own device, each picks a display name on join.
- Team names are labeled by the creator (not just "Team A" / "Team B").
- Anonymous Firebase auth gives each player a stable ID.

### Board control
- **Anyone on either team can update the board** — letter placement, eliminated letters, all of it. Teams negotiate verbally.
- **Undo:** one level, per action. Single "Undo" button reverts the last board action.
- **Turn tracking:** a manual "whose turn is it" toggle that anyone can flip. Body parts auto-add when a letter is dropped into "eliminated" — the body part goes on the *guessing* team's gallows (i.e., the team whose turn the toggle currently shows).

### Game setup
- Word length chosen in a settings panel when the room is created. **Locked** when the first letter is placed.
- Body parts: **8 total** — head, body, 2 arms, 2 legs, 2 hands, 2 feet.

### Candidate words
- Per-team private list, **auto-validated** against current board state: flagged invalid if wrong length, contradicts a placed letter, or contains an eliminated letter (from either gallows).
- **No dictionary validation** — part of the fun is arguing "is that a real word?" verbally.
- **Open question for user:** store candidate words in Firestore (synced across teammates) or localStorage (per-browser)? Recommendation: Firestore.

### Endgame
- "Guess Word" button appears on a team's side at the start of their turn.
- "Call Bluff" button appears on a team's side after the other team has responded to their letter guess.
- Resolution is verbal. The app provides standard letter-placement to reveal the final word visually if desired.
- After resolution, players click "Team [Name] Wins" → banner → "New Game" button resets board (same room, same teams).
- 8th body part auto-declares the other team the winner.

### Chat
- Two private team chats only. No cross-team chat (that's voice). Chat is text only.

### Misc
- **Desktop-first.** Mobile not required for v1.
- **No persistence.** Ephemeral rooms; no game history or accounts.

---

## Proposed file layout

```
hangmangle/
  index.html       # entry: create or join room
  game.html        # main game screen
  game.js          # all client logic
  style.css
  firebase.js      # Firebase init + helpers
  vercel.json      # static deploy config
  README.md
  .gitignore
```

---

## Firestore data model (proposed)

```
rooms/{roomCode}
  createdAt, wordLength, currentTurn: "A"|"B", locked: bool,
  teamA: { name, bodyParts: 0 },
  teamB: { name, bodyParts: 0 },
  slots: [null, null, ...]          // length = wordLength
  eliminated: { A: [], B: [] },      // letters under each gallows
  lastAction: { ... snapshot for undo ... },
  winner: null | "A" | "B"

rooms/{roomCode}/players/{playerId}
  name, team: "A"|"B", joinedAt

rooms/{roomCode}/chats/{team}/messages/{msgId}
  playerId, name, text, ts

# If candidate words go in Firestore:
rooms/{roomCode}/candidates/{team}/words/{wordId}
  text, addedBy, ts
```

Team-private data (chat, candidates) is enforced by structure — clients only subscribe to their own team's path. Security rules can be tightened later.

---

## UI layout (desktop, three columns)

- **Left column:** Team A gallows SVG (draws based on `teamA.bodyParts`), eliminated letters under it, team chat box, candidate word list. Chat + candidates only visible to Team A players.
- **Center column:** Word slots (click empty → letter input → places letter; click filled → change or clear), turn-toggle indicator, "Undo last action" button, "Declare Winner" buttons.
- **Right column:** Mirror of left, for Team B.
- **Per-side action buttons:** "Guess Word" (visible at start of that team's turn), "Call Bluff" (visible after opponent responded). These open confirmation banners; resolution is verbal then players click a winner button.

---

## Build order

1. **Skeleton** — entry/join screen, room creation, real-time Firestore sync of board state. Two browser tabs should see the same state.
2. **Board UI** — word slots, eliminated zones, letter placement, undo.
3. **Gallows + turn tracking** — 8-part SVG hangperson, body-part auto-increment, turn toggle.
4. **Team chats.**
5. **Candidate word lists** with auto-validation.
6. **Guess Word / Call Bluff / Declare Winner** flow + New Game reset.
7. **Polish** — copy, styling, empty states, error handling.

---

## Open items — confirm with user before coding step 1

1. **Firebase project setup.** User needs to:
   - Create project at https://console.firebase.google.com
   - Enable Firestore (test mode is fine for now)
   - Enable Authentication → Anonymous sign-in
   - Register a web app, copy the config object
   - Paste the config into `firebase.js` (or share it for you to do so)
   Walk them through this if they haven't done it.

2. **Candidate words storage** — Firestore (recommended) or localStorage?

3. **Confirm the file layout and build order above.** Then start step 1.

---

## Style guidance

- Keep code simple and readable. No frameworks, no build tools.
- Use ES modules with CDN imports (e.g. `import { initializeApp } from "https://www.gstatic.com/firebasejs/10.x.x/firebase-app.js"`).
- Don't add emojis to code or UI unless the user asks.
- Don't write `README.md` content beyond a brief description unless asked.
- The user is technically savvy (has shipped Vercel/Supabase projects before) — be direct, skip hand-holding on basics.
