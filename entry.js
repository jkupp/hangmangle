import {
  signIn,
  db,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "./firebase.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O
const CODE_LENGTH = 4;

const msg = document.getElementById("entry-msg");

function setMsg(text, isError = false) {
  msg.textContent = text;
  msg.classList.toggle("error", isError);
}

function generateCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

async function pickUniqueCode() {
  for (let i = 0; i < 8; i++) {
    const code = generateCode();
    const snap = await getDoc(doc(db, "rooms", code));
    if (!snap.exists()) return code;
  }
  throw new Error("Could not allocate a room code. Try again.");
}

function goToGame(code) {
  window.location.href = `game.html?room=${code}`;
}

document.getElementById("create-btn").addEventListener("click", async () => {
  const name = document.getElementById("create-name").value.trim();
  const myTeam = document.getElementById("create-team-mine").value.trim();
  const otherTeam = document.getElementById("create-team-other").value.trim();
  const wordLength = parseInt(document.getElementById("create-length").value, 10);

  if (!name || !myTeam || !otherTeam) {
    setMsg("Fill in your name and both team names.", true);
    return;
  }

  setMsg("Creating room...");
  try {
    const user = await signIn();
    const code = await pickUniqueCode();
    const roomRef = doc(db, "rooms", code);
    await setDoc(roomRef, {
      createdAt: serverTimestamp(),
      wordLength,
      currentTurn: "A",
      locked: false,
      teamA: { name: myTeam, bodyParts: 0 },
      teamB: { name: otherTeam, bodyParts: 0 },
      slots: Array(wordLength).fill(null),
      eliminated: [],
      lastAction: null,
      winner: null,
      respondedSinceTurnStart: false,
      pendingAction: null,
    });
    await setDoc(doc(db, "rooms", code, "players", user.uid), {
      name,
      team: "A",
      joinedAt: serverTimestamp(),
    });
    goToGame(code);
  } catch (err) {
    console.error(err);
    setMsg(err.message || "Something went wrong.", true);
  }
});

let pendingRoom = null;
let pendingName = null;

document.getElementById("join-lookup-btn").addEventListener("click", async () => {
  const code = document.getElementById("join-code").value.trim().toUpperCase();
  const name = document.getElementById("join-name").value.trim();
  if (!code || code.length !== CODE_LENGTH) {
    setMsg(`Room code is ${CODE_LENGTH} letters.`, true);
    return;
  }
  if (!name) {
    setMsg("Enter your name.", true);
    return;
  }

  setMsg("Looking up room...");
  try {
    await signIn();
    const snap = await getDoc(doc(db, "rooms", code));
    if (!snap.exists()) {
      setMsg(`No room with code ${code}.`, true);
      return;
    }
    const data = snap.data();
    pendingRoom = code;
    pendingName = name;
    document.getElementById("pick-team-A").textContent = data.teamA.name;
    document.getElementById("pick-team-B").textContent = data.teamB.name;
    document.getElementById("team-pick").hidden = false;
    setMsg("");
  } catch (err) {
    console.error(err);
    setMsg(err.message || "Something went wrong.", true);
  }
});

async function joinAsTeam(team) {
  if (!pendingRoom || !pendingName) return;
  setMsg("Joining...");
  try {
    const user = await signIn();
    await setDoc(doc(db, "rooms", pendingRoom, "players", user.uid), {
      name: pendingName,
      team,
      joinedAt: serverTimestamp(),
    });
    goToGame(pendingRoom);
  } catch (err) {
    console.error(err);
    setMsg(err.message || "Something went wrong.", true);
  }
}

document.getElementById("pick-team-A").addEventListener("click", () => joinAsTeam("A"));
document.getElementById("pick-team-B").addEventListener("click", () => joinAsTeam("B"));

// Uppercase the room code as the user types.
document.getElementById("join-code").addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase();
});

// If we arrived with ?room=XXXX, pre-fill the join code, hide the create
// panel (the user clearly came here to join), and focus the name field.
const urlRoom = new URLSearchParams(window.location.search).get("room");
if (urlRoom) {
  const code = urlRoom.toUpperCase().slice(0, CODE_LENGTH);
  document.getElementById("join-code").value = code;
  document.getElementById("create-panel").hidden = true;
  document.body.classList.add("join-only");
  document.getElementById("join-name").focus();
}
