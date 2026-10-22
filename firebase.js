// ① Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹)에서 복사한 값으로 바꿔 주세요.
export const firebaseConfig = {
  apiKey: "AIzaSyBLcLBytx-Tf77qoGeeizbQhtx1dlEHX1s",
  authDomain: "buzzer-f9e2b.firebaseapp.com",
  // Realtime Database > 데이터 탭 맨 위에 보이는 주소와 같아야 합니다.
  databaseURL: "https://buzzer-f9e2b-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "buzzer-f9e2b",
  storageBucket: "buzzer-f9e2b.firebasestorage.app",
  messagingSenderId: "987690105667",
  appId: "1:987690105667:web:5dacfb2a81b0724ee88df6",
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export {
  ref, set, get, update, remove, onValue, onDisconnect, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

if (firebaseConfig.apiKey.startsWith("YOUR")) {
  alert("firebase.js 파일에 Firebase 설정값을 먼저 입력해 주세요. (README.md 참고)");
}

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// 기기마다 시계가 조금씩 달라서, Firebase 서버 시각을 기준으로 카운트다운을 맞춥니다.
let offset = 0;
onValue(ref(db, ".info/serverTimeOffset"), (snap) => { offset = snap.val() || 0; });
export const serverNow = () => Date.now() + offset;

// 도전 기록을 서버 시각(t) 순으로 정렬합니다.
export function sortBuzzes(buzzes) {
  return Object.entries(buzzes || {})
    .map(([pid, b]) => ({ pid, ...b }))
    .filter((b) => typeof b.t === "number")
    .sort((a, b) => a.t - b.t);
}
