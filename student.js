import {
  db, serverNow, sortBuzzes, ref, set, get, onValue, onDisconnect, serverTimestamp,
} from "./firebase.js";

const $ = (id) => document.getElementById(id);

let room = null;
let me = null;        // { pid, name }
let config = null;
let round = null;
let buzzes = {};
let sending = false;
let unsubscribers = [];
const sessionId = Math.random().toString(36).slice(2, 10);

// ---------- 로그인 ----------
async function loadRoom() {
  const code = $("roomInput").value.trim();
  if (!code) return;
  $("joinMsg").textContent = "불러오는 중...";
  const snap = await get(ref(db, `rooms/${code}/config`));
  if (!snap.exists()) {
    $("pickBox").classList.add("hidden");
    $("joinMsg").textContent = "방을 찾을 수 없어요. 코드를 확인하거나 선생님 설정을 기다려 주세요.";
    return;
  }
  room = code;
  config = snap.val();
  const isGroup = config.mode === "group";
  $("whoLabel").textContent = isGroup ? "모둠 선택" : "이름 선택";
  const select = $("who");
  select.innerHTML = "";
  select.append(new Option(isGroup ? "-- 모둠을 고르세요 --" : "-- 이름을 고르세요 --", ""));
  for (const [pid, name] of Object.entries(config.participants || {})) {
    select.append(new Option(name, pid));
  }
  $("pickBox").classList.remove("hidden");
  $("joinMsg").textContent = "";
}

function enter() {
  const pid = $("who").value;
  if (!pid) return alert("이름(모둠)을 선택하세요.");
  me = { pid, name: config.participants[pid] };
  try { localStorage.setItem("buzzer-me", JSON.stringify({ room, ...me })); } catch {}
  startPlay();
}

function leave() {
  unsubscribers.forEach((off) => off());
  unsubscribers = [];
  set(ref(db, `rooms/${room}/presence/${me.pid}/${sessionId}`), null);
  try { localStorage.removeItem("buzzer-me"); } catch {}
  me = null;
  $("playView").classList.add("hidden");
  $("joinView").classList.remove("hidden");
}

// ---------- 도전 화면 ----------
function startPlay() {
  $("joinView").classList.add("hidden");
  $("playView").classList.remove("hidden");
  $("meName").textContent = me.name;

  // 접속 표시: 연결이 끊기면 자동으로 지워집니다.
  const presenceRef = ref(db, `rooms/${room}/presence/${me.pid}/${sessionId}`);
  unsubscribers = [
    onValue(ref(db, ".info/connected"), (s) => {
      if (!s.val() || !me) return;
      onDisconnect(presenceRef).remove();
      set(presenceRef, true);
    }),
    onValue(ref(db, `rooms/${room}/config`), (s) => {
      config = s.val();
      if (me && !config?.participants?.[me.pid]) {
        alert("선생님이 참가자 설정을 바꾸었어요. 다시 선택해 주세요.");
        leave();
      }
    }),
    onValue(ref(db, `rooms/${room}/round`), (s) => { round = s.val(); render(); }),
    onValue(ref(db, `rooms/${room}/buzzes`), (s) => { buzzes = s.val() || {}; render(); }),
  ];
}

async function buzz() {
  if (sending || stateNow() !== "open") return;
  sending = true;
  render();
  try {
    await set(ref(db, `rooms/${room}/buzzes/${me.pid}`), {
      name: me.name, t: serverTimestamp(), round: round.id,
    });
    navigator.vibrate?.(100);
  } catch {
    // 같은 모둠의 다른 친구가 이미 눌렀거나, 마감된 경우
  } finally {
    sending = false;
    render();
  }
}

function myBuzz() {
  const b = buzzes[me?.pid];
  return b && round && b.round === round.id ? b : null;
}

function stateNow() {
  if (!round) return "waiting";
  if (myBuzz()) return "done";
  if (round.closed) return "closed";
  if (serverNow() < round.openAt) return "countdown";
  return "open";
}

function render() {
  if (!me) return;
  const state = stateNow();
  const btn = $("buzzBtn");
  const cd = $("countdown");
  const rank = $("rankBig");
  const msg = $("message");

  cd.classList.toggle("hidden", state !== "countdown");
  rank.classList.toggle("hidden", state !== "done");
  btn.classList.toggle("hidden", state === "done");
  btn.disabled = state !== "open" || sending;

  if (state === "waiting") {
    msg.textContent = "선생님이 시작하기를 기다려요";
  } else if (state === "countdown") {
    cd.textContent = Math.ceil((round.openAt - serverNow()) / 1000);
    msg.textContent = "준비하세요!";
  } else if (state === "open") {
    msg.textContent = sending ? "보내는 중..." : "지금 누르세요!";
  } else if (state === "closed") {
    msg.textContent = "마감되었어요";
  } else if (state === "done") {
    const order = sortBuzzes(buzzes).filter((b) => b.round === round.id);
    const n = order.findIndex((b) => b.pid === me.pid) + 1;
    rank.textContent = n === 1 ? "🥇 1등!" : n > 0 ? `${n}등` : "✔";
    msg.textContent = config?.mode === "group"
      ? "우리 모둠이 도전했어요!"
      : "도전 완료! 선생님 화면을 보세요";
  }
}

// ---------- 이벤트 ----------
$("loadBtn").onclick = loadRoom;
$("roomInput").addEventListener("keydown", (e) => { if (e.key === "Enter") loadRoom(); });
$("enterBtn").onclick = enter;
$("leaveBtn").onclick = leave;
// 터치 기기에서 click보다 반응이 빠른 pointerdown 사용
$("buzzBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); buzz(); });
document.addEventListener("keydown", (e) => {
  if (me && (e.code === "Space" || e.key === "Enter")) { e.preventDefault(); buzz(); }
});

// 카운트다운 숫자를 매끄럽게 갱신 (0이 되는 순간 버튼 활성화)
setInterval(render, 50);

// 주소의 ?room=1234 를 자동 입력하고, 새로고침하면 이전 선택으로 다시 입장
(async () => {
  const fromUrl = new URLSearchParams(location.search).get("room");
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("buzzer-me")); } catch {}
  $("roomInput").value = fromUrl || saved?.room || "";
  if (!$("roomInput").value) return;
  await loadRoom();
  if (saved && saved.room === room && config?.participants?.[saved.pid]) {
    $("who").value = saved.pid;
    enter();
  }
})();
