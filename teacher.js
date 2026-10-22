import { db, serverNow, sortBuzzes, ref, set, update, onValue } from "./firebase.js";

const $ = (id) => document.getElementById(id);
const COUNTDOWN_MS = 3000;

let room = loadRoom();
let config = null;   // { mode, participants: { p0: "김하늘", ... } }
let round = null;    // { id, openAt, closed }
let buzzes = {};     // { pid: { name, t, round } }
let presence = {};   // { pid: { sessionId: true } }
let unsubscribers = [];
let lastFirstPid = null;

function newCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}
function loadRoom() {
  try { return localStorage.getItem("buzzer-room") || saveRoom(newCode()); }
  catch { return newCode(); }
}
function saveRoom(code) {
  try { localStorage.setItem("buzzer-room", code); } catch {}
  return code;
}
const roomRef = (path = "") => ref(db, `rooms/${room}${path ? "/" + path : ""}`);

// ---------- 방 연결 ----------
function connectRoom() {
  unsubscribers.forEach((off) => off());
  config = null; round = null; buzzes = {}; presence = {}; lastFirstPid = null;

  $("roomCode").textContent = room;
  const url = new URL("student.html", location.href);
  url.searchParams.set("room", room);
  $("joinLink").href = url.href;
  $("joinLink").textContent = url.href;
  $("qr").innerHTML = "";
  if (window.QRCode) new QRCode($("qr"), { text: url.href, width: 280, height: 280 });

  unsubscribers = [
    onValue(roomRef("config"), (s) => { config = s.val(); fillConfigForm(); render(); }),
    onValue(roomRef("round"), (s) => { round = s.val(); render(); }),
    onValue(roomRef("buzzes"), (s) => { buzzes = s.val() || {}; render(); }),
    onValue(roomRef("presence"), (s) => { presence = s.val() || {}; render(); }),
  ];
}

// ---------- 설정 ----------
function selectedMode() {
  return document.querySelector('input[name="mode"]:checked').value;
}
function toggleModeBox() {
  const group = selectedMode() === "group";
  $("groupBox").classList.toggle("hidden", !group);
  $("individualBox").classList.toggle("hidden", group);
}
function fillConfigForm() {
  if (!config) {
    $("configInfo").textContent = "아직 설정이 없어요. 참가자를 입력하고 저장하세요.";
    return;
  }
  document.querySelector(`input[name="mode"][value="${config.mode}"]`).checked = true;
  const list = Object.values(config.participants || {});
  if (config.mode === "group") $("groupCount").value = list.length;
  else $("names").value = list.join("\n");
  toggleModeBox();
  $("configInfo").textContent = `저장됨: ${config.mode === "group" ? "모둠별" : "개인별"} ${list.length}개`;
}
async function saveConfig() {
  const mode = selectedMode();
  let list;
  if (mode === "group") {
    const n = Math.max(1, Math.min(30, parseInt($("groupCount").value, 10) || 1));
    list = Array.from({ length: n }, (_, i) => `${i + 1}모둠`);
  } else {
    list = [...new Set($("names").value.split("\n").map((s) => s.trim()).filter(Boolean))];
    if (!list.length) return alert("학생 이름을 한 명 이상 입력하세요.");
  }
  const prefix = mode === "group" ? "g" : "p";
  const participants = Object.fromEntries(list.map((name, i) => [`${prefix}${i}`, name]));
  await update(roomRef(), { config: { mode, participants }, round: null, buzzes: null });
}

// ---------- 진행 ----------
async function startRound() {
  if (!config) return alert("먼저 참가 방식을 설정하고 저장하세요.");
  lastFirstPid = null;
  await update(roomRef(), {
    round: { id: Date.now(), openAt: serverNow() + COUNTDOWN_MS, closed: false },
    buzzes: null,
  });
}
function closeRound() {
  if (round) set(roomRef("round/closed"), true);
}
function resetRound() {
  update(roomRef(), { round: null, buzzes: null });
}

// ---------- 화면 ----------
function statusText() {
  if (!round) return "준비 — ‘시작’을 누르세요";
  if (round.closed) return "⏹ 마감되었어요";
  const left = round.openAt - serverNow();
  if (left > 0) return `⏳ ${Math.ceil(left / 1000)}`;
  return "🔔 도전 받는 중!";
}

function render() {
  $("status").textContent = statusText();
  $("closeBtn").disabled = !round || round.closed;

  const order = round ? sortBuzzes(buzzes).filter((b) => b.round === round.id) : [];
  const list = $("results");
  list.innerHTML = "";
  order.forEach((b, i) => {
    const li = document.createElement("li");
    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = i === 0 ? "🥇" : `${i + 1}`;
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = config?.participants?.[b.pid] || b.name;
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = `+${((b.t - round.openAt) / 1000).toFixed(3)}초`;
    li.append(rank, name, time);
    list.append(li);
  });
  $("noResult").classList.toggle("hidden", order.length > 0);

  if (order[0] && order[0].pid !== lastFirstPid) {
    lastFirstPid = order[0].pid;
    ding();
  }

  // 참가자 접속/도전 상태
  const chips = $("chips");
  chips.innerHTML = "";
  const rankOf = Object.fromEntries(order.map((b, i) => [b.pid, i + 1]));
  let online = 0;
  for (const [pid, name] of Object.entries(config?.participants || {})) {
    const chip = document.createElement("span");
    const isOnline = !!presence[pid] && Object.keys(presence[pid]).length > 0;
    if (isOnline) online++;
    chip.className = "chip" + (rankOf[pid] ? " buzzed" : isOnline ? " online" : "");
    chip.textContent = rankOf[pid] ? `${name} · ${rankOf[pid]}등` : name;
    chips.append(chip);
  }
  const total = Object.keys(config?.participants || {}).length;
  $("onlineCount").textContent = total ? `(접속 ${online} / ${total})` : "";
}

// 1등이 나오면 짧은 효과음
let audioCtx;
function ding() {
  try {
    audioCtx ||= new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch {}
}

// ---------- 이벤트 ----------
document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", toggleModeBox));
$("saveConfigBtn").onclick = () => {
  if (round && !confirm("설정을 바꾸면 현재 도전 기록이 지워져요. 계속할까요?")) return;
  saveConfig();
};
$("startBtn").onclick = startRound;
$("closeBtn").onclick = closeRound;
$("resetBtn").onclick = resetRound;
$("newRoomBtn").onclick = () => {
  if (!confirm("새 방을 만들면 학생들이 새 코드로 다시 접속해야 해요. 계속할까요?")) return;
  room = saveRoom(newCode());
  connectRoom();
};

setInterval(() => { $("status").textContent = statusText(); }, 100);
connectRoom();
