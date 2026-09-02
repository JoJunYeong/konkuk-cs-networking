import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  browserSessionPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const runtime = window.KU_ADMIN_FIREBASE;
const sourceConfig = window.NETWORKING_SITE_CONFIG;

if (!runtime?.firebase?.projectId || !sourceConfig?.events) {
  document.body.innerHTML = "<main style='padding:40px'>관리자 설정 파일을 확인해 주세요.</main>";
  throw new Error("admin_configuration_missing");
}

const clone = (value) =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const firebaseApp = initializeApp(runtime.firebase);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const state = {
  events: clone(sourceConfig.events),
  history: { schemaVersion: 1, sourceNote: "", events: [] },
  selectedEventId: sourceConfig.events[0]?.id || "",
  selectedHistoryId: "",
  ready: false,
};

const elements = {
  loginPanel: $("#login-panel"),
  loginForm: $("#login-form"),
  loginMessage: $("#login-message"),
  dashboard: $("#dashboard"),
  syncStatus: $("#sync-status"),
  accountName: $("#account-name"),
  eventSelect: $("#event-select"),
  eventForm: $("#event-form"),
  historySelect: $("#history-select"),
  historyForm: $("#history-form"),
};

function showLoginMessage(message) {
  elements.loginMessage.textContent = message;
}

function showSyncStatus(message, isError = false) {
  elements.syncStatus.textContent = message;
  elements.syncStatus.classList.toggle("is-error", isError);
}

function setBusy(form, busy) {
  $$('button[type="submit"]', form).forEach((button) => {
    button.disabled = busy;
  });
}

function documentRef(name) {
  return doc(db, runtime.collection, runtime.documents[name]);
}

async function readPayload(name) {
  const snapshot = await getDoc(documentRef(name));
  if (!snapshot.exists()) return null;
  const payload = snapshot.data()?.payload;
  if (typeof payload !== "string") return null;
  return JSON.parse(payload);
}

async function writePayload(name, payload) {
  await setDoc(documentRef(name), {
    payload: JSON.stringify(payload),
    updatedAt: serverTimestamp(),
    updatedBy: runtime.adminUsername,
  });
}

async function loadStaticHistory() {
  const response = await fetch("./data/history.json", { cache: "no-store" });
  if (!response.ok) throw new Error("history_fallback_failed");
  return response.json();
}

async function loadDashboardData() {
  showSyncStatus("저장된 자료를 확인하는 중입니다.");

  const [managedEvents, managedHistory, staticHistory] = await Promise.all([
    readPayload("events"),
    readPayload("history"),
    loadStaticHistory(),
  ]);

  state.events = Array.isArray(managedEvents) && managedEvents.length > 0
    ? managedEvents
    : clone(sourceConfig.events);
  state.history = managedHistory?.events ? managedHistory : staticHistory;

  if (!managedEvents) await writePayload("events", state.events);
  if (!managedHistory) await writePayload("history", state.history);

  state.selectedEventId = state.events.find((event) => event.featured)?.id || state.events[0]?.id || "";
  state.selectedHistoryId = state.history.events[0]?.id || "";
  state.ready = true;
  renderEventSelect();
  renderHistorySelect();
  showSyncStatus("최신 자료를 불러왔습니다. 저장하면 공개 페이지에 바로 반영됩니다.");
}

function value(form, name) {
  return String(form.elements[name]?.value || "").trim();
}

function setValue(form, name, data) {
  const control = form.elements[name];
  if (!control) return;
  if (control.type === "checkbox") control.checked = Boolean(data);
  else control.value = data ?? "";
}

function agendaToText(agenda) {
  return (Array.isArray(agenda) ? agenda : [])
    .map((item) => [item.time, item.title, item.description].join(" | "))
    .join("\n");
}

function textToAgenda(raw) {
  return String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [time = "", title = "", ...description] = line.split("|").map((part) => part.trim());
      return { time, title, description: description.join(" | ") };
    })
    .filter((item) => item.time && item.title);
}

function currentEvent() {
  return state.events.find((event) => event.id === state.selectedEventId) || null;
}

function renderEventSelect() {
  elements.eventSelect.replaceChildren();
  state.events.forEach((event) => {
    const option = document.createElement("option");
    option.value = event.id;
    const linkWarning = event.status === "open" && !event.registrationUrl ? " · 신청 링크 없음" : "";
    option.textContent = `${event.quarter} · ${event.statusLabel}${linkWarning}`;
    option.selected = event.id === state.selectedEventId;
    elements.eventSelect.append(option);
  });
  renderEventForm();
}

function renderEventForm() {
  const event = currentEvent();
  if (!event) return;
  [
    "id", "quarter", "sequence", "status", "statusLabel", "titleLineOne", "titleLineTwo",
    "description", "notice", "dateLabel", "time", "venue", "locationNotice", "priceLabel",
    "capacity", "registrationUrl", "applicationLabel", "applicationCopy", "aboutIntro", "quote", "programDescription",
  ].forEach((name) => setValue(elements.eventForm, name, event[name]));
  setValue(
    elements.eventForm,
    "registrationProvider",
    event.registrationProvider || sourceConfig.registration?.provider || "onoffmix",
  );
  setValue(elements.eventForm, "featured", event.featured);
  setValue(elements.eventForm, "agenda", agendaToText(event.agenda));
}

function collectEventForm() {
  const event = currentEvent();
  if (!event) return;
  const previousId = event.id;
  [
    "id", "quarter", "sequence", "status", "statusLabel", "titleLineOne", "titleLineTwo",
    "description", "notice", "dateLabel", "time", "venue", "locationNotice", "priceLabel",
    "registrationProvider", "registrationUrl", "applicationLabel", "applicationCopy", "aboutIntro", "quote", "programDescription",
  ].forEach((name) => {
    event[name] = value(elements.eventForm, name);
  });
  event.address = "";
  event.capacity = Number(elements.eventForm.elements.capacity.value) || 1;
  event.featured = elements.eventForm.elements.featured.checked;
  event.agenda = textToAgenda(elements.eventForm.elements.agenda.value);
  if (event.id !== previousId) state.selectedEventId = event.id;
}

function nextQuarter() {
  const parsed = state.events
    .map((event) => /^(\d{4})-Q([1-4])$/.exec(event.id))
    .filter(Boolean)
    .map((match) => Number(match[1]) * 4 + Number(match[2]) - 1)
    .sort((a, b) => b - a)[0] ?? new Date().getFullYear() * 4;
  const next = parsed + 1;
  const year = Math.floor(next / 4);
  const quarter = (next % 4) + 1;
  return { id: `${year}-Q${quarter}`, label: `${year} Q${quarter}` };
}

function addEvent() {
  collectEventForm();
  const next = nextQuarter();
  const event = {
    id: next.id,
    quarter: next.label,
    sequence: String(state.events.length + 1).padStart(2, "0"),
    status: "upcoming",
    statusLabel: "예정",
    featured: false,
    eyebrow: `KONKUK CSE ALUMNI · ${next.label}`,
    titleLineOne: "다음 모임을",
    titleLineTwo: "준비하고 있습니다.",
    description: "일정과 장소가 정해지는 대로 알려드리겠습니다.",
    notice: "동문이 직접 준비하는 비공식 모임",
    dateLabel: "일정 확정 후 공개",
    time: "시간 확정 후 공개",
    venue: "장소 확정 후 공개",
    address: "",
    priceLabel: "참가비 확정 전",
    capacity: 40,
    registrationProvider: "onoffmix",
    registrationUrl: "",
    locationNotice: "정확한 장소는 신청·결제 완료자에게 운영자가 별도로 안내합니다.",
    applicationLabel: "오픈 예정",
    applicationCopy: "신청 시작일이 정해지면 이곳에서 안내하겠습니다.",
    aboutIntro: "학교와 일 이야기를 편하게 나누는 자리입니다.",
    quote: "선후배끼리 얼굴 한 번 보고, 다음에 연락할 수 있으면 충분합니다.",
    programDescription: "진행 순서는 일정이 정해진 뒤 공개하겠습니다.",
    agenda: [],
  };
  state.events.push(event);
  state.selectedEventId = event.id;
  renderEventSelect();
  showSyncStatus("새 회차를 만들었습니다. 내용을 확인한 뒤 저장해 주세요.");
}

function deleteEvent() {
  if (state.events.length <= 1) {
    showSyncStatus("행사는 최소 한 회차가 있어야 합니다.", true);
    return;
  }
  const event = currentEvent();
  if (!event || !window.confirm(`${event.quarter} 회차를 목록에서 지울까요? 저장 전에는 공개 페이지에 반영되지 않습니다.`)) return;
  state.events = state.events.filter((item) => item !== event);
  state.selectedEventId = state.events[0].id;
  renderEventSelect();
  showSyncStatus("회차를 목록에서 뺐습니다. 확정하려면 저장해 주세요.");
}

function validateEvents() {
  const ids = new Set();
  for (const event of state.events) {
    if (!/^\d{4}-Q[1-4]$/.test(event.id)) throw new Error("회차 ID는 2027-Q1 형식으로 적어 주세요.");
    if (ids.has(event.id)) throw new Error("같은 회차 ID가 두 번 들어 있습니다.");
    ids.add(event.id);
    if (!event.quarter || !event.titleLineOne || !event.dateLabel || !event.venue) throw new Error("필수 항목을 모두 입력해 주세요.");
    if (!Number.isFinite(event.capacity) || event.capacity < 1) throw new Error("정원을 확인해 주세요.");
    if (event.registrationUrl) {
      let parsed;
      try {
        parsed = new URL(event.registrationUrl);
      } catch (_error) {
        throw new Error("신청 URL 형식을 확인해 주세요.");
      }
      if (parsed.protocol !== "https:") throw new Error("신청 URL은 https:// 주소만 사용할 수 있습니다.");
    }
  }
  if (!state.events.some((event) => event.featured)) state.events[0].featured = true;
  const featured = state.events.filter((event) => event.featured);
  if (featured.length > 1) {
    const keep = featured.find((event) => event.id === state.selectedEventId) || featured[0];
    state.events.forEach((event) => { event.featured = event === keep; });
  }
}

async function saveEvents(event) {
  event.preventDefault();
  setBusy(elements.eventForm, true);
  try {
    collectEventForm();
    validateEvents();
    await writePayload("events", state.events);
    renderEventSelect();
    const openWithoutLink = state.events.some((item) => item.status === "open" && !item.registrationUrl);
    showSyncStatus(
      openWithoutLink
        ? "행사 내용은 저장했습니다. ‘신청 가능’ 회차에 신청 URL이 없어 공개 버튼은 아직 열리지 않습니다."
        : "분기별 행사 내용을 저장했습니다. 공개 신청 버튼에도 반영됩니다.",
      false,
    );
  } catch (error) {
    showSyncStatus(error?.message || "행사 내용을 저장하지 못했습니다.", true);
  } finally {
    setBusy(elements.eventForm, false);
  }
}

function currentHistory() {
  return state.history.events.find((event) => event.id === state.selectedHistoryId) || null;
}

function renderHistorySelect() {
  elements.historySelect.replaceChildren();
  state.history.events.forEach((event) => {
    const option = document.createElement("option");
    option.value = event.id;
    option.textContent = `${event.date} · ${event.title}`;
    option.selected = event.id === state.selectedHistoryId;
    elements.historySelect.append(option);
  });
  renderHistoryForm();
}

function renderHistoryForm() {
  const event = currentHistory();
  if (!event) return;
  ["id", "sequence", "date", "attendees", "title", "venue", "summary", "learning"].forEach((name) => {
    setValue(elements.historyForm, name, event[name]);
  });
  setValue(elements.historyForm, "highlights", (event.highlights || []).join(", "));
}

function collectHistoryForm() {
  const event = currentHistory();
  if (!event) return;
  const previousId = event.id;
  ["id", "date", "title", "venue", "summary", "learning"].forEach((name) => {
    event[name] = value(elements.historyForm, name);
  });
  event.sequence = Number(elements.historyForm.elements.sequence.value) || 1;
  event.attendees = Number(elements.historyForm.elements.attendees.value) || 0;
  event.highlights = value(elements.historyForm, "highlights")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (event.id !== previousId) state.selectedHistoryId = event.id;
}

function addHistory() {
  collectHistoryForm();
  const sequence = Math.max(0, ...state.history.events.map((event) => Number(event.sequence) || 0)) + 1;
  const year = new Date().getFullYear();
  const event = {
    id: `networking-day-${year}-${String(sequence).padStart(2, "0")}`,
    sequence,
    date: new Date().toISOString().slice(0, 10),
    title: `${year}년 제${sequence}회 Networking Day`,
    venue: "",
    attendees: 0,
    summary: "",
    highlights: [],
    learning: "",
  };
  state.history.events.push(event);
  state.selectedHistoryId = event.id;
  renderHistorySelect();
  showSyncStatus("새 기록을 만들었습니다. 공개할 내용만 적어 주세요.");
}

function deleteHistory() {
  const event = currentHistory();
  if (!event || !window.confirm(`${event.title} 기록을 목록에서 지울까요? 저장 전에는 공개 페이지에 반영되지 않습니다.`)) return;
  state.history.events = state.history.events.filter((item) => item !== event);
  state.selectedHistoryId = state.history.events[0]?.id || "";
  renderHistorySelect();
  showSyncStatus("기록을 목록에서 뺐습니다. 확정하려면 저장해 주세요.");
}

function validatePublicHistory() {
  const serialized = JSON.stringify(state.history.events);
  if (/\b\d{7,}\b/.test(serialized)) throw new Error("7자리 이상 이어진 숫자가 있습니다. 연락처나 계좌번호인지 확인해 주세요.");
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialized)) throw new Error("이메일 주소는 지난 기록에 공개하지 않습니다.");
  if (/(계좌번호|은행계좌|연락처|전화번호)/.test(serialized)) throw new Error("개인정보로 보이는 문구가 있습니다. 공개용 내용만 남겨 주세요.");
  state.history.events.forEach((event) => {
    if (!event.id || !event.date || !event.title || !event.venue || !event.summary) throw new Error("필수 항목을 모두 입력해 주세요.");
  });
}

async function saveHistory(event) {
  event.preventDefault();
  setBusy(elements.historyForm, true);
  try {
    collectHistoryForm();
    validatePublicHistory();
    state.history.events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    await writePayload("history", state.history);
    renderHistorySelect();
    showSyncStatus("지난 기록을 저장했습니다.");
  } catch (error) {
    showSyncStatus(error?.message || "지난 기록을 저장하지 못했습니다.", true);
  } finally {
    setBusy(elements.historyForm, false);
  }
}

function switchTab(name) {
  $$('[data-admin-tab]').forEach((button) => {
    const active = button.dataset.adminTab === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $$('[data-admin-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.adminPanel !== name;
  });
}

async function login(event) {
  event.preventDefault();
  const username = value(elements.loginForm, "username");
  const password = elements.loginForm.elements.password.value;
  elements.loginForm.elements.password.value = "";
  if (username !== runtime.adminUsername) {
    showLoginMessage("아이디 또는 비밀번호를 확인해 주세요.");
    return;
  }

  setBusy(elements.loginForm, true);
  showLoginMessage("로그인하는 중입니다.");
  try {
    await setPersistence(auth, browserSessionPersistence);
    await signInWithEmailAndPassword(auth, runtime.loginEmail, password);
  } catch (_error) {
    showLoginMessage("아이디 또는 비밀번호를 확인해 주세요.");
  } finally {
    setBusy(elements.loginForm, false);
  }
}

async function showDashboard(user) {
  if (user.email !== runtime.loginEmail) {
    await signOut(auth);
    showLoginMessage("이 계정에는 관리자 권한이 없습니다.");
    return;
  }
  elements.accountName.textContent = runtime.adminUsername;
  elements.loginPanel.hidden = true;
  elements.dashboard.hidden = false;
  try {
    await loadDashboardData();
  } catch (_error) {
    showSyncStatus("관리 자료를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.", true);
  }
}

function showLogin() {
  state.ready = false;
  elements.dashboard.hidden = true;
  elements.loginPanel.hidden = false;
}

elements.loginForm.addEventListener("submit", login);
$("#logout-button").addEventListener("click", () => signOut(auth));
elements.eventSelect.addEventListener("change", () => {
  collectEventForm();
  state.selectedEventId = elements.eventSelect.value;
  renderEventForm();
});
elements.historySelect.addEventListener("change", () => {
  collectHistoryForm();
  state.selectedHistoryId = elements.historySelect.value;
  renderHistoryForm();
});
elements.eventForm.addEventListener("submit", saveEvents);
elements.historyForm.addEventListener("submit", saveHistory);
$("#add-event").addEventListener("click", addEvent);
$("#delete-event").addEventListener("click", deleteEvent);
$("#add-history").addEventListener("click", addHistory);
$("#delete-history").addEventListener("click", deleteHistory);
$$('[data-admin-tab]').forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.adminTab)));

onAuthStateChanged(auth, (user) => {
  if (user) showDashboard(user);
  else showLogin();
});
