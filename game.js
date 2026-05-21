import {
  signIn,
  db,
  doc,
  collection,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from "./firebase.js";

const params = new URLSearchParams(window.location.search);
const roomCode = (params.get("room") || "").toUpperCase();

const msgEl = document.getElementById("game-msg");
let msgTimer = null;
function setMsg(text, isError = false) {
  if (msgTimer) {
    clearTimeout(msgTimer);
    msgTimer = null;
  }
  msgEl.textContent = text;
  msgEl.classList.toggle("error", isError);
  if (text && isError) {
    msgTimer = setTimeout(() => {
      msgEl.textContent = "";
      msgEl.classList.remove("error");
      msgTimer = null;
    }, 3500);
  }
}

function eliminatedList(data) {
  // Tolerate the previous { A: [], B: [] } schema during transition.
  const e = data.eliminated;
  if (Array.isArray(e)) return e;
  if (e && typeof e === "object") {
    const merged = [...(e.A || []), ...(e.B || [])];
    return Array.from(new Set(merged));
  }
  return [];
}

if (!roomCode) {
  setMsg("No room code in URL.", true);
  throw new Error("missing room code");
}

document.getElementById("room-code").textContent = roomCode;

const roomRef = doc(db, "rooms", roomCode);
let currentRoom = null;
let currentPlayers = [];
let myUid = null;
let editingSlot = null; // index of slot currently being edited locally
let myTeam = null; // "A" | "B", populated once we identify ourselves in the players list
let chatUnsubscribe = null;
let candidatesUnsubscribe = null;
let currentCandidates = [];
let didRedirectMissing = false;

function snapshotForUndo() {
  return {
    slots: currentRoom.slots,
    eliminated: eliminatedList(currentRoom),
    teamABodyParts: currentRoom.teamA?.bodyParts ?? 0,
    teamBBodyParts: currentRoom.teamB?.bodyParts ?? 0,
    winner: currentRoom.winner ?? null,
    respondedSinceTurnStart: currentRoom.respondedSinceTurnStart ?? false,
  };
}

function gameOver() {
  if (currentRoom?.winner) {
    setMsg("Game is over. Use Undo to revert if needed.", true);
    return true;
  }
  return false;
}

async function setSlot(index, letter) {
  if (gameOver()) return;
  if (currentRoom.pendingAction) {
    setMsg("Resolve the pending action first.", true);
    return;
  }
  const L = letter ? letter.toUpperCase() : null;
  if (L && eliminatedList(currentRoom).includes(L)) {
    setMsg(`"${L}" is already eliminated — remove it first.`, true);
    return;
  }
  const newSlots = [...currentRoom.slots];
  newSlots[index] = L;
  await updateDoc(roomRef, {
    slots: newSlots,
    lastAction: snapshotForUndo(),
    respondedSinceTurnStart: true,
  });
}

async function addEliminated(letter) {
  if (gameOver()) return;
  if (currentRoom.pendingAction) {
    setMsg("Resolve the pending action first.", true);
    return;
  }
  const L = (letter || "").toUpperCase();
  if (!/^[A-Z]$/.test(L)) return;
  if (currentRoom.slots.includes(L)) {
    setMsg(`"${L}" is already placed in the word.`, true);
    return;
  }
  const list = eliminatedList(currentRoom);
  if (list.includes(L)) return;

  const turn = currentRoom.currentTurn;
  const teamKey = `team${turn}`;
  const newBodyParts = (currentRoom[teamKey]?.bodyParts ?? 0) + 1;
  const updates = {
    eliminated: [...list, L],
    lastAction: snapshotForUndo(),
    [`${teamKey}.bodyParts`]: newBodyParts,
    respondedSinceTurnStart: true,
  };
  if (newBodyParts >= 10) {
    updates.winner = turn === "A" ? "B" : "A";
  }
  await updateDoc(roomRef, updates);
}

async function resetGame(newWordLength) {
  const length = parseInt(newWordLength, 10);
  const finalLength = Number.isFinite(length) && length >= 2 && length <= 20
    ? length
    : currentRoom.wordLength;
  await updateDoc(roomRef, {
    wordLength: finalLength,
    slots: Array(finalLength).fill(null),
    eliminated: [],
    "teamA.bodyParts": 0,
    "teamB.bodyParts": 0,
    winner: null,
    lastAction: null,
    respondedSinceTurnStart: false,
    pendingAction: null,
  });
}

async function toggleTurn() {
  if (gameOver()) return;
  if (currentRoom.pendingAction) {
    setMsg("Resolve the pending action first.", true);
    return;
  }
  await updateDoc(roomRef, {
    currentTurn: currentRoom.currentTurn === "A" ? "B" : "A",
    respondedSinceTurnStart: false,
  });
}

async function startAction(type) {
  if (gameOver()) return;
  if (currentRoom.pendingAction) return;
  await updateDoc(roomRef, {
    pendingAction: { type, initiator: currentRoom.currentTurn },
  });
}

async function cancelAction() {
  await updateDoc(roomRef, { pendingAction: null });
}

async function declareWinner(team) {
  if (team !== "A" && team !== "B") return;
  await updateDoc(roomRef, {
    winner: team,
    pendingAction: null,
    lastAction: snapshotForUndo(),
  });
}

function openResetDialog() {
  const dialog = document.getElementById("reset-dialog");
  document.getElementById("reset-word-length").value = String(currentRoom.wordLength);
  dialog.returnValue = "";
  dialog.showModal();
}

async function undo() {
  if (!currentRoom?.lastAction) return;
  const last = currentRoom.lastAction;
  const updates = {
    slots: last.slots,
    eliminated: last.eliminated,
    lastAction: null,
  };
  if ("teamABodyParts" in last) updates["teamA.bodyParts"] = last.teamABodyParts;
  if ("teamBBodyParts" in last) updates["teamB.bodyParts"] = last.teamBBodyParts;
  if ("winner" in last) updates.winner = last.winner;
  if ("respondedSinceTurnStart" in last) updates.respondedSinceTurnStart = last.respondedSinceTurnStart;
  await updateDoc(roomRef, updates);
}

function buildSlotElements(count) {
  const container = document.getElementById("word-slots");
  container.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const cell = document.createElement("div");
    cell.className = "slot empty";
    cell.dataset.index = String(i);
    cell.addEventListener("click", () => beginSlotEdit(i));
    container.appendChild(cell);
  }
}

function renderSlots(data) {
  const container = document.getElementById("word-slots");
  if (container.children.length !== data.wordLength) {
    buildSlotElements(data.wordLength);
  }
  for (let i = 0; i < data.wordLength; i++) {
    if (editingSlot === i) continue;
    const cell = container.children[i];
    // Skip if user replaced this with an input element (defensive).
    if (cell.tagName !== "DIV") continue;
    const letter = data.slots[i];
    if (letter) {
      cell.textContent = letter;
      cell.classList.remove("empty");
      cell.classList.add("filled");
    } else {
      cell.textContent = "";
      cell.classList.add("empty");
      cell.classList.remove("filled");
    }
  }
}

function beginSlotEdit(index) {
  if (editingSlot !== null) return; // one at a time
  if (currentRoom.slots[index]) return; // placed letters are locked
  const container = document.getElementById("word-slots");
  const cell = container.children[index];
  if (!cell) return;
  editingSlot = index;

  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 1;
  input.className = "slot editing";
  input.value = currentRoom.slots[index] || "";
  cell.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const commit = async (save) => {
    if (done) return;
    done = true;
    const value = input.value.trim().toUpperCase();
    editingSlot = null;
    // Rebuild the DOM cell in this slot.
    const newCell = document.createElement("div");
    newCell.className = "slot empty";
    newCell.dataset.index = String(index);
    newCell.addEventListener("click", () => beginSlotEdit(index));
    input.replaceWith(newCell);
    // Sync current state from currentRoom (re-render).
    renderSlots(currentRoom);
    if (save && /^[A-Z]$/.test(value)) {
      await setSlot(index, value);
    }
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      commit(false);
    }
  });
  input.addEventListener("blur", () => commit(true));
}

// Body part order: 1 head, 2 body, 3 left arm, 4 right arm,
// 5 left leg, 6 right leg, 7 left hand, 8 right hand, 9 left foot, 10 right foot.
function gallowsSvg(count) {
  const c = Number(count) || 0;
  const show = (n) => (c >= n ? "" : ' style="display:none"');
  return `
    <svg viewBox="0 0 200 240" class="gallows-svg" preserveAspectRatio="xMidYMid meet">
      <g class="frame" stroke="#3a3a3a" stroke-width="4" stroke-linecap="round" fill="none">
        <line x1="20" y1="232" x2="135" y2="232"/>
        <line x1="40" y1="232" x2="40" y2="18"/>
        <line x1="38" y1="20" x2="125" y2="20"/>
        <line x1="40" y1="42" x2="62" y2="20" stroke-width="3"/>
        <line x1="120" y1="20" x2="120" y2="48" stroke-width="2.5"/>
      </g>
      <g class="body" stroke="#1c1c1c" stroke-width="3" stroke-linecap="round" fill="none">
        <circle${show(1)} cx="120" cy="65" r="16"/>
        <line${show(2)} x1="120" y1="81" x2="120" y2="150"/>
        <line${show(3)} x1="120" y1="100" x2="98" y2="128"/>
        <line${show(4)} x1="120" y1="100" x2="142" y2="128"/>
        <line${show(5)} x1="120" y1="150" x2="103" y2="188"/>
        <line${show(6)} x1="120" y1="150" x2="137" y2="188"/>
        <circle${show(7)} cx="93" cy="135" r="5" fill="#1c1c1c"/>
        <circle${show(8)} cx="147" cy="135" r="5" fill="#1c1c1c"/>
        <circle${show(9)} cx="98" cy="194" r="5" fill="#1c1c1c"/>
        <circle${show(10)} cx="142" cy="194" r="5" fill="#1c1c1c"/>
      </g>
    </svg>
  `;
}

function renderGallows(data) {
  document.getElementById("gallows-A").innerHTML = gallowsSvg(data.teamA?.bodyParts ?? 0);
  document.getElementById("gallows-B").innerHTML = gallowsSvg(data.teamB?.bodyParts ?? 0);
}

function renderTurnInfo(data) {
  const row = document.querySelector(".turn-row");
  const el = document.getElementById("turn-info");
  const btn = document.getElementById("switch-turn-btn");
  if (data.winner || data.pendingAction) {
    row.hidden = true;
    return;
  }
  row.hidden = false;
  el.innerHTML = "";
  el.classList.remove("winner");
  const team = data.currentTurn === "A" ? data.teamA : data.teamB;
  const strong = document.createElement("strong");
  strong.textContent = team.name;
  el.appendChild(strong);
  el.append(" guess a letter");
  btn.hidden = false;
}

function renderActionBanner(data) {
  const banner = document.getElementById("action-banner");
  const textEl = document.getElementById("action-text");
  const btns = document.getElementById("action-buttons");
  textEl.innerHTML = "";
  btns.innerHTML = "";

  const makeBtn = (label, cls, onClick) => {
    const b = document.createElement("button");
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener("click", onClick);
    return b;
  };

  if (data.winner) {
    banner.hidden = false;
    banner.className = "action-banner winner";
    const team = data[`team${data.winner}`];
    const strong = document.createElement("strong");
    strong.textContent = team.name;
    textEl.appendChild(strong);
    textEl.append(" wins!");
    btns.appendChild(makeBtn("New game", "primary", () => openResetDialog()));
    return;
  }

  if (data.pendingAction) {
    banner.hidden = false;
    banner.className = "action-banner pending";
    const initTeam = data[`team${data.pendingAction.initiator}`];
    const strong = document.createElement("strong");
    strong.textContent = initTeam.name;
    textEl.appendChild(strong);
    if (data.pendingAction.type === "guessWord") {
      textEl.append(" is guessing your word. Resolve verbally, then click the winner.");
    } else {
      textEl.append(" is calling bluff. The other team must produce a valid word.");
    }
    btns.appendChild(makeBtn(`${data.teamA.name} wins`, "primary", () => declareWinner("A")));
    btns.appendChild(makeBtn(`${data.teamB.name} wins`, "primary", () => declareWinner("B")));
    btns.appendChild(makeBtn("Cancel", "", () => cancelAction()));
    return;
  }

  banner.hidden = true;
  banner.className = "action-banner";
}

function renderTeamActions(data) {
  for (const team of ["A", "B"]) {
    const container = document.getElementById(`actions-${team}`);
    const guessBtn = container.querySelector(".guess-word-btn");
    const bluffBtn = container.querySelector(".call-bluff-btn");
    if (data.winner || data.pendingAction || data.currentTurn !== team) {
      container.hidden = true;
      continue;
    }
    container.hidden = false;
    const responded = !!data.respondedSinceTurnStart;
    guessBtn.hidden = responded;
    bluffBtn.hidden = !responded;
  }
}

function renderEliminated(data) {
  const zone = document.getElementById("eliminated");
  zone.innerHTML = "";
  const letters = [...eliminatedList(data)].sort();
  for (const letter of letters) {
    const chip = document.createElement("span");
    chip.className = "elim-chip";
    chip.textContent = letter;
    zone.appendChild(chip);
  }
}

function renderRoom(data) {
  if (!data) {
    setMsg("Room not found.", true);
    return;
  }
  currentRoom = data;
  document.getElementById("team-A-name").textContent = data.teamA.name;
  document.getElementById("team-B-name").textContent = data.teamB.name;
  document.getElementById("word-length").textContent = data.wordLength;
  renderTurnInfo(data);
  renderActionBanner(data);
  renderTeamActions(data);
  renderSlots(data);
  renderEliminated(data);
  renderGallows(data);
  renderCandidates();
  document.getElementById("undo-btn").disabled = !data.lastAction;
}

function renderChat(messages) {
  if (!myTeam) return;
  const container = document.getElementById(`messages-${myTeam}`);
  // Preserve "stuck to bottom" feel: scroll if we're already near the bottom.
  const nearBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight < 40;
  container.innerHTML = "";
  if (messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "msg-empty";
    empty.textContent = "No messages yet.";
    container.appendChild(empty);
    return;
  }
  for (const m of messages) {
    const row = document.createElement("div");
    row.className = "msg-row";
    if (m.playerId === myUid) row.classList.add("mine");
    const name = document.createElement("span");
    name.className = "msg-name";
    name.textContent = m.name + ":";
    const text = document.createElement("span");
    text.className = "msg-text";
    text.textContent = m.text;
    row.appendChild(name);
    row.appendChild(text);
    container.appendChild(row);
  }
  if (nearBottom) container.scrollTop = container.scrollHeight;
}

function subscribeToChat() {
  if (chatUnsubscribe || !myTeam) return;
  const messagesRef = collection(db, "rooms", roomCode, "chats", myTeam, "messages");
  chatUnsubscribe = onSnapshot(
    query(messagesRef, orderBy("ts", "asc")),
    (snap) => {
      const messages = snap.docs.map((d) => d.data());
      renderChat(messages);
    },
    (err) => {
      console.error("chat listener error", err);
    }
  );

  // Reveal this team's chat box and wire the form.
  const section = document.getElementById(`chat-${myTeam}`);
  section.hidden = false;
  const form = document.getElementById(`chat-form-${myTeam}`);
  const input = document.getElementById(`chat-input-${myTeam}`);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    const me = currentPlayers.find((p) => p.id === myUid);
    try {
      await addDoc(messagesRef, {
        playerId: myUid,
        name: me?.name ?? "?",
        text,
        ts: serverTimestamp(),
      });
    } catch (err) {
      console.error("chat send failed", err);
      input.value = text; // restore so the user can retry
      setMsg("Could not send message.", true);
    }
  });
}

function validateCandidate(text) {
  if (!currentRoom) return { valid: true };
  const word = (text || "").toUpperCase();
  const slots = currentRoom.slots || [];
  const eliminated = eliminatedList(currentRoom);

  if (word.length !== currentRoom.wordLength) {
    return {
      valid: false,
      reason: `${word.length} letter${word.length === 1 ? "" : "s"}, need ${currentRoom.wordLength}`,
    };
  }
  for (const L of eliminated) {
    if (word.includes(L)) return { valid: false, reason: `contains eliminated "${L}"` };
  }
  const placedLetters = new Set();
  for (const s of slots) if (s) placedLetters.add(s);
  for (let i = 0; i < slots.length; i++) {
    const placed = slots[i];
    const candLetter = word[i];
    if (placed && candLetter !== placed) {
      return { valid: false, reason: `position ${i + 1} should be "${placed}"` };
    }
    if (!placed && placedLetters.has(candLetter)) {
      return { valid: false, reason: `extra "${candLetter}" at position ${i + 1}` };
    }
  }
  return { valid: true };
}

function renderCandidates() {
  if (!myTeam) return;
  const container = document.getElementById(`candidates-${myTeam}`);
  const clearBtn = document.querySelector(`#cand-${myTeam} .cand-clear-btn`);
  if (clearBtn) clearBtn.hidden = currentCandidates.length === 0;
  container.innerHTML = "";
  if (currentCandidates.length === 0) {
    const empty = document.createElement("div");
    empty.className = "cand-empty";
    empty.textContent = "No candidates yet.";
    container.appendChild(empty);
    return;
  }
  for (const cand of currentCandidates) {
    const row = document.createElement("div");
    row.className = "candidate";

    const text = document.createElement("span");
    text.className = "cand-text";
    text.textContent = cand.text;
    row.appendChild(text);

    const status = validateCandidate(cand.text);
    if (!status.valid) {
      row.classList.add("invalid");
      const reason = document.createElement("span");
      reason.className = "cand-reason";
      reason.textContent = status.reason;
      row.appendChild(reason);
    }

    const remove = document.createElement("button");
    remove.className = "cand-remove";
    remove.type = "button";
    remove.textContent = "×";
    remove.title = "Remove";
    remove.addEventListener("click", () => removeCandidate(cand.id));
    row.appendChild(remove);

    container.appendChild(row);
  }
}

async function addCandidate(text) {
  if (!myTeam) return;
  const word = (text || "").trim().toUpperCase();
  if (!/^[A-Z]+$/.test(word)) {
    setMsg("Candidates must be letters only.", true);
    return;
  }
  if (currentCandidates.some((c) => c.text === word)) return;
  const ref = collection(db, "rooms", roomCode, "candidates", myTeam, "words");
  await addDoc(ref, {
    text: word,
    addedBy: myUid,
    ts: serverTimestamp(),
  });
}

async function removeCandidate(id) {
  if (!myTeam) return;
  await deleteDoc(doc(db, "rooms", roomCode, "candidates", myTeam, "words", id));
}

async function clearAllCandidates() {
  if (!myTeam || currentCandidates.length === 0) return;
  const batch = writeBatch(db);
  for (const cand of currentCandidates) {
    batch.delete(doc(db, "rooms", roomCode, "candidates", myTeam, "words", cand.id));
  }
  await batch.commit();
}

function subscribeToCandidates() {
  if (candidatesUnsubscribe || !myTeam) return;
  const ref = collection(db, "rooms", roomCode, "candidates", myTeam, "words");
  candidatesUnsubscribe = onSnapshot(
    query(ref, orderBy("ts", "asc")),
    (snap) => {
      currentCandidates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderCandidates();
    },
    (err) => {
      console.error("candidates listener error", err);
    }
  );

  const section = document.getElementById(`cand-${myTeam}`);
  section.hidden = false;
  const clearBtn = section.querySelector(".cand-clear-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      if (currentCandidates.length === 0) return;
      const confirmed = window.confirm(
        `Clear all ${currentCandidates.length} candidate word${currentCandidates.length === 1 ? "" : "s"}?`
      );
      if (!confirmed) return;
      try {
        await clearAllCandidates();
      } catch (err) {
        console.error("clear candidates failed", err);
        setMsg("Could not clear candidates.", true);
      }
    });
  }
  const form = document.getElementById(`cand-form-${myTeam}`);
  const input = document.getElementById(`cand-input-${myTeam}`);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = "";
    try {
      await addCandidate(text);
    } catch (err) {
      console.error("add candidate failed", err);
      input.value = text;
      setMsg("Could not add candidate.", true);
    }
  });
}

function renderPlayers() {
  const a = document.getElementById("players-A");
  const b = document.getElementById("players-B");
  a.innerHTML = "";
  b.innerHTML = "";
  for (const p of currentPlayers) {
    const div = document.createElement("div");
    div.className = "player";
    if (p.id === myUid) div.classList.add("me");
    div.textContent = p.name + (p.id === myUid ? " (you)" : "");
    (p.team === "A" ? a : b).appendChild(div);
  }
  for (const container of [a, b]) {
    if (container.children.length === 0) {
      const empty = document.createElement("div");
      empty.className = "player empty";
      empty.textContent = "Waiting for players...";
      container.appendChild(empty);
    }
  }
}

function wireStaticHandlers() {
  document.getElementById("undo-btn").addEventListener("click", () => undo());
  document.getElementById("elim-add-btn").addEventListener("click", () => {
    const input = window.prompt("Add eliminated letter:");
    if (!input) return;
    addEliminated(input);
  });
  document.getElementById("switch-turn-btn").addEventListener("click", () => {
    if (currentRoom?.winner) return;
    toggleTurn();
  });

  const dialog = document.getElementById("reset-dialog");
  document.getElementById("reset-btn").addEventListener("click", () => {
    if (!currentRoom) return;
    openResetDialog();
  });
  dialog.addEventListener("close", () => {
    if (dialog.returnValue !== "confirm") return;
    const newLength = document.getElementById("reset-word-length").value;
    resetGame(newLength);
  });

  for (const btn of document.querySelectorAll(".guess-word-btn")) {
    btn.addEventListener("click", () => startAction("guessWord"));
  }
  for (const btn of document.querySelectorAll(".call-bluff-btn")) {
    btn.addEventListener("click", () => startAction("callBluff"));
  }

  const copyBtn = document.getElementById("copy-code-btn");
  copyBtn.addEventListener("click", async () => {
    const link = `${window.location.origin}/?room=${roomCode}`;
    try {
      await navigator.clipboard.writeText(link);
      const original = copyBtn.textContent;
      copyBtn.textContent = "Copied!";
      copyBtn.disabled = true;
      setTimeout(() => {
        copyBtn.textContent = original;
        copyBtn.disabled = false;
      }, 1200);
    } catch (err) {
      console.error("clipboard failed", err);
      setMsg(`Copy failed. Link: ${link}`, true);
    }
  });
}

async function start() {
  try {
    const user = await signIn();
    myUid = user.uid;
  } catch (err) {
    console.error(err);
    setMsg("Could not sign in to Firebase.", true);
    return;
  }

  wireStaticHandlers();

  onSnapshot(
    roomRef,
    (snap) => {
      if (!snap.exists()) {
        setMsg(`Room ${roomCode} does not exist.`, true);
        return;
      }
      renderRoom(snap.data());
    },
    (err) => {
      console.error(err);
      setMsg("Lost connection to room.", true);
    }
  );

  const playersRef = collection(db, "rooms", roomCode, "players");
  onSnapshot(
    query(playersRef, orderBy("joinedAt", "asc")),
    (snap) => {
      currentPlayers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderPlayers();
      if (!myTeam) {
        const me = currentPlayers.find((p) => p.id === myUid);
        if (me?.team) {
          myTeam = me.team;
          subscribeToChat();
          subscribeToCandidates();
        } else if (!didRedirectMissing && myUid) {
          // We're not a registered player in this room. Send them to the join
          // flow — but give a brief grace window in case our doc is still
          // propagating, to avoid bouncing legitimate joiners.
          didRedirectMissing = true;
          setTimeout(() => {
            const meStill = currentPlayers.find((p) => p.id === myUid);
            if (!meStill) {
              window.location.replace(`./?room=${roomCode}`);
            }
          }, 1500);
        }
      }
    },
    (err) => {
      console.error(err);
    }
  );
}

start();
