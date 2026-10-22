// ① Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹)에서 복사한 값으로 바꿔 주세요.
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000",
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
